const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

async function getQuestions(eventId) {
    const snapshot = await admin.firestore().collection('events').doc(eventId).get();
    return snapshot.data().questions;
}

exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    let questions = await getQuestions('test3');
    res.send(questions)
})