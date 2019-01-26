let fs = require('fs')
let express = require('express')
let https = require('https')
let moment = require('moment')
let bodyParser = require('body-parser')
let jsonBodyParser = bodyParser.json()
var cookieParser = require('cookie-parser');
var session = require('express-session');
let SessionState = require('./SessionState.js')
let Datastore = require('nedb')
const STATES = require('./SessionStateEnum.js');
require('dotenv').load();

let sessions = new Datastore({
    filename: `./` + getEnvVar("DB_NAME") + `.db`,
});

let registry = new Datastore({
    filename: `./` + getEnvVar("REGISTRY_DB") + `.db`,
});

registry.loadDatabase()

if (process.env.NODE_ENV !== 'test') {
	sessions.loadDatabase();
}

// compact data file every 5 minutes
if (process.env.NODE_ENV !== 'test') {
	db.persistence.setAutocompactionInterval(5*60000)
} else {
    db.persistence.setAutocompactionInterval(10)
}

const app = express();

let STATE;

//Set up state storage
const stateFilename = getEnvVar('STATE_FILENAME');

loadState();

//Set up Twilio
const accountSid = getEnvVar('TWILIO_SID');
const authToken = getEnvVar('TWILIO_TOKEN');

const client = require('twilio')(accountSid, authToken);
const MessagingResponse = require('twilio').twiml.MessagingResponse;

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname));

function log(logString) {
    console.log(moment().toString() + " - " + logString)
}

function getEnvVar(name) {
	return process.env.NODE_ENV === 'test' ? process.env[name + '_TEST'] : process.env[name];
}
//TODO replace with database loading
function loadState() {
	let filepath = './' + stateFilename + '.json';
	if (fs.existsSync(filepath)) {
	    let stateData = JSON.parse(fs.readFileSync(filepath));
	    if (Object.keys(stateData).length > 0) {
	    	STATE = SessionState.createState(stateData);
	    } else {
	    	STATE = {};
	    }
	} else {
		STATE = {};
	}
}

function updateState(uuid, unit, phoneNumber, type, state) {
    if(type === "double_click") {
        numPresses = 2;
    }
    else {
        numPresses = 1;
    }

	if (STATE == null || Object.keys(STATE).length === 0 || !STATE.hasOwnProperty(phoneNumber)) {
		STATE[phoneNumber] = new SessionState(uuid, unit, phoneNumber, state, numPresses);
	}
    else {
		STATE[phoneNumber].update(uuid, unit, phoneNumber, type, state);
	}
}

function saveState() {
    fs.writeFileSync('./' + stateFilename + '.json', JSON.stringify(STATE));
}

/**
Check if a request is valid based on the presence of required body properties
**/
function isValidRequest(req, properties) {

	const hasAllProperties = (hasAllPropertiesSoFar, currentProperty) => hasAllPropertiesSoFar && req.body.hasOwnProperty(currentProperty);
	return properties.reduce(hasAllProperties, true);
}

function handleValidRequest(uuid, unit, phoneNumber, numPresses) {

	 log('UUID: ' + uuid.toString() + ' Unit:' + unit.toString() + ' Presses:' + numPresses.toString());

   //Check if there's a session for this phone number that has not yet been responded to
   db.findOne({'phoneNumber':phoneNumber, 'respondedTo':false}, function(err, session) {
      //If there is no such session, create an entry in the database corresponding to a new seession
       if(session === null) {
         session = new SessionState(uuid, unit, phoneNumber, state=STATES.STARTED, numPresses);
         db.insert(session, (err, docs) => {
             if(err) {
                 log(err.message)
             }
         })

       }
       //If there is an ongoing session, increment it's button presses and update the time of the last button press, and replace that object in the db
       else {
         db.update({_id: session._id}, { $set: {'lastUpdate': moment()}, {'numPresses': session.numPresses += numPresses} }, (err,numReplaced) => {
           if(err){
             log(err.message)
           }
         }
       }
   })
	 if (needToSendMessage(phoneNumber)) {
		sendUrgencyMessage(phoneNumber);
	}
}

function handleErrorRequest(error) {
	log(error);
}

function handleTwilioRequest(req) {

	let phoneNumber = req.body.From;
	let buttonPhone = req.body.To;
	let message = req.body.Body;
	if (phoneNumber === getEnvVar('RESPONDER_PHONE')) {
		let returnMessage = STATE[buttonPhone].advanceSession(message);
		sendTwilioMessage(buttonPhone, returnMessage);
		saveState();
        //put completed states in the database
        if(STATE[buttonPhone].state == STATES.COMPLETED) {
            db.insert(STATE[buttonPhone], (err, docs) => {
                if(err) {
                    log(err.message)
                }
            })
        }
    	io.emit("stateupdate", STATE);
		return 200;
	} else {
		handleErrorRequest('Invalid Phone Number');
		return 400;
	}
}

function needToSendMessage(buttonPhone) {

  db.findOne({'phoneNumber':phoneNumber, 'respondedTo':false}, function(err, session) {



	return (STATE[buttonPhone].numPresses === 1 || STATE[buttonPhone].numPresses === 3 || STATE[buttonPhone].numPresses % 5 === 0);
}

function sendUrgencyMessage(phoneNumber) {

	if (STATE[phoneNumber].numPresses === 1) {
		sendTwilioMessage(phoneNumber, 'There has been a request for help from Unit ' + STATE[phoneNumber].unit.toString() + ' . Please respond "Ok" when you have followed up on the call.');
		setTimeout(remindToSendMessage, 300000, phoneNumber);
		setTimeout(sendStaffAlert, 420000, phoneNumber, STATE[phoneNumber].unit.toString());
	} else if (STATE[phoneNumber].numPresses % 5 === 0 || STATE[phoneNumber].numPresses === 3) {
		sendTwilioMessage(phoneNumber, 'This in an urgent request. The button has been pressed ' + STATE[phoneNumber].numPresses.toString() + ' times. Please respond "Ok" when you have followed up on the call.');
	}
}

function sendTwilioMessage(phone, msg) {
	client.messages
      .create({from: phone, body: msg, to: getEnvVar('RESPONDER_PHONE')})
      .then(message => log(message.sid))
      .done();
}

function remindToSendMessage(phoneNumber) {
	if (STATE[phoneNumber].state === STATES.STARTED) {
		STATE[phoneNumber].state = STATES.WAITING_FOR_REPLY;
		io.emit("stateupdate", STATE);
		sendTwilioMessage(phoneNumber, 'Please Respond "Ok" if you have followed up on your call. If you do not respond within 2 minutes an emergency alert will be issued to staff.');
	}
}

function registryInsert(array) {
  registry.insert(array)
}

function sendStaffAlert(phoneNumber, unit) {
	if (STATE[phoneNumber].state === STATES.WAITING_FOR_REPLY) {
        client.messages
          .create({from: phoneNumber, body: 'There has been an unresponed request at unit ' + unit.toString(), to: getEnvVar('STAFF_PHONE')})
          .then(message => log(message.sid))
          .done();
    }
    //Unresponded alerts are completed and logged in database
    db.insert(STATE[phoneNumber], (err, docs) => {
        if(err) {
            log(err.message)
        }
    })
}

app.use(cookieParser());

// initialize express-session to allow us track the logged-in user across sessions.
app.use(session({
    key: 'user_sid',
    secret: getEnvVar('SECRET'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: 600000
    }
}));

// This middleware will check if user's cookie is still saved in browser and user is not set, then automatically log the user out.
// This usually happens when you stop your express server after login, your cookie still remains saved in the browser.
app.use((req, res, next) => {
    if (req.cookies.user_sid && !req.session.user) {
        res.clearCookie('user_sid');
    }
    next();
});


// middleware function to check for logged-in users
var sessionChecker = (req, res, next) => {
    if (req.session.user && req.cookies.user_sid) {
        res.redirect('/dashboard');
    } else {
        next();
    }
};


app.get('/', sessionChecker, (req, res) => {
    res.redirect('/login');
});


app.route('/login')
    .get(sessionChecker, (req, res) => {
        res.sendFile(__dirname + '/login.html');
    })
    .post((req, res) => {
        var username = req.body.username,
            password = req.body.password;

        if ((username === getEnvVar('WEB_USERNAME')) && (password === getEnvVar('PASSWORD'))) {
        	req.session.user = username;
        	res.redirect('/dashboard');
        } else {
        	res.redirect('/login');
        }
 });

//return the current state as json if user logged in
app.get('/data', (req, res) => {
	if (req.session.user && req.cookies.user_sid) {
		res.status(200).json(STATE);
	} else {
		res.redirect('/login');
	}
});

app.get('/dashboard', (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        res.sendFile(__dirname + '/dashboard.html');
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    if (req.session.user && req.cookies.user_sid) {
        res.clearCookie('user_sid');
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

app.post('/', jsonBodyParser, (req, res) => {

	const requiredBodyParams = ['UUID','Type'];

	if (isValidRequest(req, requiredBodyParams)) {
        registry.findOne({'uuid':req.body.UUID}, function(err, button) {
            if(button === null) {
                handleErrorRequest(`Bad request: UUID is not registered. UUID is ${req.body.UUID}`);
                handleErrorRequest(err);
                res.status(400).send();
            }
            else {
                if(button.type.toString()== 'double_click'){
                  let numPresses = 2;
                }else {
                  numPresses = 1
                }
                handleValidRequest(button.uuid.toString(), button.unit.toString(), button.phone.toString(), numPresses)
                res.status(200).send();
            }
        })
	}
    else {
		handleErrorRequest('Bad request: UUID is missing');
		res.status(400).send();
	}
});

app.post('/message', jsonBodyParser, (req, res) => {

	const requiredBodyParams = ['Body', 'From', 'To'];

	if (isValidRequest(req, requiredBodyParams)) {

		let status = handleTwilioRequest(req);
		res.writeHead(200, {'Content-Type': 'text/xml'});
		res.status(status).send();

	} else {
		handleErrorRequest('Bad request: Body or From fields are missing');
		res.status(400).send();
	}

});

let server;

if (process.env.NODE_ENV === 'test') { // local http server for testing
	server = app.listen(443);
    //TODO: put into serverTest
    registry.insert([{"uuid":"111","unit":"123","phone":"+16664206969","_id":"CGBadbmt3EhfDeYd"},
                     {"uuid":"222","unit":"222","phone":"+17774106868","_id":"JUdabgmtlwp0pgjW"}]);
}
else {
	let httpsOptions = {
	    key: fs.readFileSync(`/etc/letsencrypt/live/chatbot.brave.coop/privkey.pem`),
	    cert: fs.readFileSync(`/etc/letsencrypt/live/chatbot.brave.coop/fullchain.pem`)
	}
	server = https.createServer(httpsOptions, app).listen(443)
	log('brave server listening on port 443')
}

const io = require("socket.io")(server);

module.exports = server;