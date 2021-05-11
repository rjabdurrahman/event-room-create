const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });


exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    res.send('Hello World');
})