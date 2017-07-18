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
    [
       {
          "id":"b9e9e3b3-c165-4bb7-a282-bff94b84c568",
          "clientId":"30b3d9c6-3711-40ef-9640-4353b1202736",
          "source":"83CE7F71-E9EF-4356-AC99-0C2F0CC4307D",
          "destination":"",
          "priority":"LOW",
          "reliability":"BEST_EFFORT",
          "eventTime":1500414626585,
          "sender":"",
          "type":"DATA",
          "properties":{

          },
          "direction":"FROM_DEVICE",
          "receivedTime":1500414626711,
          "sentTime":1500414626719,
          "payload":{
             "format":"urn:com:oracle:iot:device:timg:vfsmarthospitality:thermostat:attributes",
             "data":{
                "$(source)_location":"BARCELONA",
                "moduleName":"Oracle Spain Netatmo",
                "temperature":31.2,
                "deviceId":"70:ee:50:1a:d0:12",
                "setpointTemp":0,
                "moduleMac":"04:00:00:1a:b1:7c"
             }
          }
       }
    ]
    **/

    if ( !req.body || !req.body[0].payload || !req.body[0].payload.data || !req.body[0].payload.data.temperature || !("$(source)_location" in req.body[0].payload.data) ) {
      log.error("", "Invalid JSON received for %s device event: %s", req.params.device, JSON.stringify(req.body))
      return;
    }
    var URI = DBURI + '/' + req.body[0].payload.data["$(source)_location"] + '/' + req.body[0].payload.data.temperature;
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
