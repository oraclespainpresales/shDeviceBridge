'use strict';

// Module imports
var express = require('express')
  , restify = require('restify')
  , http = require('http')
  , bodyParser = require('body-parser')
  , util = require('util')
  , log = require('npmlog-ts')
  , _ = require('lodash')
;

const restURI = '/devices'
    , deviceURI = '/:device'
    , NETATMO = "NETATMO"
    , DBHOST  = "https://new.apex.digitalpracticespain.com"
    , DBURI   = "/ords/pdb1/smarthospitality/netatmo/set"
;

log.stream = process.stdout;
log.timestamp = true;
log.level = 'verbose';

// Instantiate classes & servers
var app      = express()
  , router   = express.Router()
  , server   = http.createServer(app)
  , dbClient = restify.createStringClient({
    url: DBHOST,
    rejectUnauthorized: false
  })
;

// ************************************************************************
// Main code STARTS HERE !!
// ************************************************************************

// Main handlers registration - BEGIN
// Main error handler
process.on('uncaughtException', function (err) {
  log.error("","Uncaught Exception: " + err);
  log.error("","Uncaught Exception: " + err.stack);
});
// Detect CTRL-C
process.on('SIGINT', function() {
  log.error("","Caught interrupt signal");
  log.error("","Exiting gracefully");
  process.exit(2);
});
// Main handlers registration - END

// REST engine initial setup
const PORT = 30000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// REST stuff - BEGIN
router.post( deviceURI, (req, res) => {
  res.status(204).end();
  if (req.params.device === NETATMO) {
    // Handle Netatmo message
    /** JSON expected
    {
      "id": "d48ddcac-e0ae-4940-b3d3-a01d567f87c9",
      "clientId": "72d4e7be-7542-4298-a033-34fe18c1d242",
      "source": "83CE7F71-E9EF-4356-AC99-0C2F0CC4307D",
      "destination": "",
      "priority": "LOW",
      "reliability": "BEST_EFFORT",
      "eventTime": 1500410826468,
      "eventTimeAsString": "2017-07-18T20:47:06Z",
      "sender": "",
      "type": "DATA",
      "properties": {},
      "direction": "FROM_DEVICE",
      "receivedTime": 1500410826604,
      "receivedTimeAsString": "2017-07-18T20:47:06Z",
      "sentTime": 1500410826613,
      "sentTimeAsString": "2017-07-18T20:47:06Z",
      "payload": {
        "format": "urn:com:oracle:iot:device:timg:vfsmarthospitality:thermostat:attributes",
        "data": {
          "$(source)_location": "BARCELONA",
          "moduleName": "Oracle Spain Netatmo",
          "temperature": 30.5,
          "deviceId": "70:ee:50:1a:d0:12",
          "setpointTemp": 0,
          "moduleMac": "04:00:00:1a:b1:7c"
        }
      }
    }
    **/

    if ( !req.body || !req.body.payload || !req.body.payload.data || !req.body.payload.data.temperature || !("$(source)_location" in req.body.payload.data) ) {
      log.error("", "Invalid JSON received for %s device event: %s", req.params.device, JSON.stringify(req.body))
      return;
    }
    var URI = DBURI + '/' + req.body.payload.data["$(source)_location"] + '/' + req.body.payload.data.temperature;
    dbClient.post(URI, (err, _req, _res, data) => {
      if (err) {
        log.error("","[POST] Error from DB call: " + err.statusCode);
        log.error("", "URI: " + URI);
        return;
      }
    });
  } else {
    log.error("", "Device %s not recognized. Ignoring", req.params.device);
  }
});

app.use(restURI, router);
// REST stuff - END

server.listen(PORT, () => {
  _.each(router.stack, (r) => {
    log.info("","Listening for any '%s' request at http://localhost:%s%s%s", "POST", PORT, restURI, deviceURI);
  });
});
