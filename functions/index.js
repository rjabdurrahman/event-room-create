const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

async function getQuestions(eventId) {
    const snapshot = await admin.firestore().collection('events').doc(eventId).get();
    return snapshot.data().questions;
}

async function getUsers(eventId) {
    const snapshot = await admin.firestore().collection('events').doc(eventId).collection('users').where("userLeft", "==", false).get();
    let eventUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    eventUsers.forEach(x => {
        if (!x.usersSpokenTo) x.usersSpokenTo = [];
        x.usersRoom = null;
    });
    let userTypeA = eventUsers.filter(x => x.userType == "A");
    let userTypeB = eventUsers.filter(x => x.userType == "B");
    return [userTypeA, userTypeB];
}

exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    let eventId = req.query.eventId;
    // deleteOldRooms(eventId);
    let questions = await getQuestions(eventId);
    let [userTypeA, userTypeB] = await getUsers(eventId);
    res.send(userTypeB)
});

exports.addDummyUsers = require('./addDummyUsers');