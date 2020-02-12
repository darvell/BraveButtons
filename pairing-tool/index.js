let flicLib = require('fliclib-linux-hci')
const fs = require('fs')
const CsvWriter = require('csv-write-stream')
const { prompt } = require('enquirer')
let FlicClient = flicLib.FlicClient
let FlicScanWizard = flicLib.FlicScanWizard

let client = new FlicClient('localhost', 5551)

let csvWriter = CsvWriter({headers: ['button_id','unit','phone_number']})
csvWriter.pipe(fs.createWriteStream(`./pairing-tool-output-${Math.random().toString(36).slice(-5)}.csv`))

async function scanAndPairOneButton() {

    let promise = new Promise((resolve, reject) => {

        let wizard = new FlicScanWizard()
        // wizard.on('foundPublicButton', (bdAddr, name) => console.log(`Found a public button with UUID ${bdAddr}, keep holding it down...`))
        // wizard.on('buttonConnected', (bdAddr, name) => console.log(`Connected to a button with UUID ${bdAddr}, keep holding it down...`)) 
        wizard.on('completed', async (result, bdAddr, name) => {
            console.log(`Completed pairing for button ${bdAddr} with result: ${result}`)
            if(result !== 'WizardSuccess') {
                resolve()
            }
            else {

                let unitQuestion = {
                    type: 'input',
                    name: 'unit',
                    message: 'What is the unit for this new button?'
                }

                let phoneNumberQuestion = {
                    type: 'input',
                    name: 'phoneNumber',
                    message: 'What is the phone number for this new button?'
                }

                let confirmQuestion = {
                    type: 'confirm',
                    name: 'confirmation',
                    message: 'Create a button with the info above?'
                }

                const response = await prompt([unitQuestion, phoneNumberQuestion, confirmQuestion])
                
                if(response.confirmation) {
                    csvWriter.write([bdAddr, response.unit, response.phoneNumber])
                }

                resolve()
            }
        })

        client.addScanWizard(wizard)
    })

    await promise
}

async function runPairingTool() {

    console.log('Welcome to the Brave Button pairing tool.')

    while(true) {
    
        let continuePairingQuestion = {
            type: 'confirm',
            name: 'continuePairing',
            message: 'Do you want to pair a button?'
        }

        const response = await prompt(continuePairingQuestion)

        if(response.continuePairing) {
            console.log('Hold down the button you want to pair...')
            await scanAndPairOneButton()
        }
        else {
            console.log('Pairing tool finished. Bye!')
            csvWriter.end()
            client.close()
            break
        }
    }
}

client.on('ready', runPairingTool)
client.on('error', (error) => console.log(error))