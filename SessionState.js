const STATES = require('./SessionStateEnum.js');
let moment = require('moment');

const incidentTypes = {
	'0': 'Accidental',
	'1': 'Safer Use',
	'2': 'Unsafe Guest',
	'3': 'Overdose'
};

class SessionState {

  constructor(uuid, unit, phoneNumber, state=STATES.STARTED, numPresses) {
        this.uuid = uuid;
        this.unit = unit;
        this.phoneNumber = phoneNumber;
        this.state = state;
        this.completed = this.isCompleted();
        this.incidentType = null;
        this.numPresses = numPresses;
        this.notes = null;
        this.lastUpdate = moment().toString();
  }

  advanceSession(messageText) {

  	let returnMessage;

  	switch (this.state) {
  		case STATES.STARTED:
  			this.state = STATES.WAITING_FOR_CATEGORY;
  			returnMessage = 'Thank you for responding.\n Please reply with the number that best describes the nature of the incident\n0 - accidental\n1 - safer use\n2 - unsafe guest\n3 - overdose';
  			break;
		case STATES.WAITING_FOR_REPLY:
			this.state = STATES.WAITING_FOR_CATEGORY;
  			returnMessage = 'Thank you for responding.\n Please reply with the number that best describes the nature of the incident\n0 - accidental\n1 - safer use\n2 - unsafe guest\n3 - overdose';
  			break;
		case STATES.WAITING_FOR_CATEGORY:
			let isValid = this.setIncidentType(messageText.trim());
			this.state = isValid ? STATES.WAITING_FOR_DETAILS : STATES.WAITING_FOR_CATEGORY;
			returnMessage = this.setIncidentType(messageText.trim()) ? 'Thank you. Please add any further details about the incident or comment about this interface.' : 'Sorry, the incident type wasn\'nt recognized. Please try again';
			break;
		case STATES.WAITING_FOR_DETAILS:
			this.notes = messageText.trim();
			this.state = STATES.COMPLETED;
			returnMessage = 'Thank you.';
			break;
		case STATES.COMPLETED:
		returnMessage = 'There is no active session for this button.';
			break;
		case STATES.TIMED_OUT:
		returnMessage = 'There is no active session for this button.';
			break;
		default:
			returnMessage = 'Thank you for responding. Unfortunately, we have encountered an error in our system and will deal with it shortly.';
			break;
  	}

  	this.lastUpdate = moment().toString();

  	return returnMessage;

  }

  setIncidentType(numType) {   //TODO: how strict do we want to be with this?

  	if (numType in incidentTypes) {
  		this.incidentType = incidentTypes[numType];
  		return true;
  	}
  	return false;

  }

  update(uuid, unit, phoneNumber,type, state) {

  	if (!this.isCompleted()) //there is an ongoing request for help
		{ if (this.uuid == uuid) {
			this.incrementButtonPresses(type);
		}
		} else {
			this.uuid = uuid;
			this.unit = unit;
			this.phoneNumber = phoneNumber;
			this.state = state;
			this.notes = null;
			this.completed = this.isCompleted();
			this.numPresses = 1;

	this.lastUpdate = moment().toString();
	}
}

  incrementButtonPresses(type) {
		if(type =='double_click'){
			this.numPresses += 2;
		}else {
			this.numPresses += 1;

		}
  }

  isCompleted() { // a request can move down the queue once the incident is dealt with
  	return (this.state == STATES.WAITING_FOR_CATEGORY || this.state == STATES.WAITING_FOR_DETAILS || this.state == STATES.COMPLETED || this.state == STATES.TIMED_OUT);
  }

  complete() {
  	this.state = STATES.COMPLETED;
  	this.completed = true;
  }
}

SessionState.createState = (stateData) => {
	let newState = {};
	for (let phoneNumber in stateData) {
		let buttonSesssion = stateData[phoneNumber];
		newState[phoneNumber] = new SessionState(buttonSesssion.uuid, buttonSesssion.unit, buttonSesssion.phoneNumber, buttonSesssion.state, buttonSesssion.numPresses);
	}
	return newState;
}

module.exports = SessionState;