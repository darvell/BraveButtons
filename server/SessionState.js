class SessionState {

    constructor(id, installationId, buttonId, unit, phoneNumber, state, numPresses, createdAt, updatedAt, incidentType, notes, fallBackAlertTwilioStatus) {
        this.id = id
        this.installationId = installationId
        this.buttonId = buttonId
        this.unit = unit
        this.phoneNumber = phoneNumber
        this.state = state
        this.numPresses = numPresses 
        this.createdAt = createdAt
        this.updatedAt = updatedAt
        this.incidentType = incidentType
        this.notes = notes
        this.fallBackAlertTwilioStatus = fallBackAlertTwilioStatus
    }

    incrementButtonPresses(numPresses) {
        this.numPresses += numPresses
    }

}

module.exports = SessionState;
