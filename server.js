'use strict';

// Module imports
var express = require('express')
  , restify = require('restify')
  , http = require('http')
  , bodyParser = require('body-parser')
  , util = require('util')
  , cors = require('cors')
  , log = require('npmlog-ts')
  , _ = require('lodash')
;

const restURI       = '/devices'
    , deviceURI     = '/:device/:op?/:demozone?'
    , NETATMO       = "NETATMO"
    , NUKI          = "NUKI"
    , COZMO         = "COZMO"
    , DBHOST        = "https://new.apex.digitalpracticespain.com"
    , APIPCSHOST    = "http://new.local.proxy.digitalpracticespain.com"
    , NETATMOURI    = "/ords/pdb1/smarthospitality/netatmo/set"
    , BASEPORTURI   = "/ords/pdb1/smarthospitality/admin/setup/baseport/%s"
    , COZMOCOMMANDS = "/ords/pdb1/smarthospitality/cozmo/action/%s/%s"
    , APIPPROXYPORT = "18%s1"
    , OPNETATMOSET  = "SET"
    , OPNUKIUNLATCH = "UNLATCH"
    , UNLATCHURI    = "/" + OPNUKIUNLATCH
    , COZMOURI      = "/" + COZMO
;

log.stream = process.stdout;
log.timestamp = true;
log.level = 'verbose';

// Instantiate classes & servers
var app      = express()
  , router   = express.Router()
  , server   = http.createServer(app)
  , dbClient = restify.createJsonClient({
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
app.use(cors());

// REST stuff - BEGIN
router.post( deviceURI, (req, res) => {
  if (req.params.device === NETATMO) {
    if (!req.params.op) {
      // Handle Netatmo update message from IoTCS
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
      res.status(204).end();
      if ( !req.body || !req.body[0].payload || !req.body[0].payload.data || !req.body[0].payload.data.temperature || !("$(source)_location" in req.body[0].payload.data) ) {
        log.error("", "Invalid JSON received for %s device event: %s", req.params.device, JSON.stringify(req.body))
        return;
      }
      var URI = NETATMOURI + '/' + req.body[0].payload.data["$(source)_location"] + '/' + req.body[0].payload.data.temperature;
      dbClient.post(URI, (err, _req, _res, data) => {
        if (err) {
          log.error("","[POST] Error from DB call: " + err.statusCode);
          log.error("", "URI: " + URI);
          return;
        }
      });
    } else if (req.params.op.toUpperCase() === OPNETATMOSET) {
      res.status(404).end();
    } else {
      // Unknown OP for NETATMO
      res.status(404).end();
    }
  } else if (req.params.device === NUKI) {
    if (!req.params.op || req.params.op.toUpperCase() !== OPNUKIUNLATCH || !req.params.demozone) {
      res.status(400).end();
      return;
    }
    // First get the demozone's BASEPORT for Proxy communication with APIPCS deployed on NUC
    var URI = util.format(BASEPORTURI, req.params.demozone.toUpperCase());
    dbClient.get(URI, (err, _req, _res) => {
      if (err) {
        var errorMsg = util.format("Error retrieving DEMOZONE information for %s: %s", req.params.demozone.toUpperCase(), err.statusCode);
        log.error("", errorMsg);
        log.error("", "URI: " + URI);
        res.status(500).send(errorMsg);
        return;
      };
      if (!_res.body || !JSON.parse(_res.body).baseport) {
        var errorMsg = util.format("Error: No data retrieved for DEMOZONE %s", req.params.demozone.toUpperCase());
        log.error("", errorMsg);
        res.status(500).send(errorMsg);
        return;
      }
      var PROXYURL = APIPCSHOST + ":" + util.format(APIPPROXYPORT, JSON.parse(_res.body).baseport);
      log.verbose("", "PROXY URL: %s", PROXYURL);
      var proxyClient = restify.createStringClient({
        url: PROXYURL,
        retry: false,
        connectTimeout: 1000,
        requestTimeout: 20000
      });
      log.verbose("", "Sending UNLATCH request...");
      proxyClient.get(UNLATCHURI, (__err, __req, __res) => {
        log.verbose("", "UNLATCH request callback invoked...");
        if (__err) {
          var errorMsg = util.format("Error UNLATCHING door: %s", __err.message);
          log.error("", errorMsg);
          // We return a 200 CODE in order to avoid any retry from BPEL
          res.status(200).json( { error: errorMsg, uri: PROXYURL + UNLATCHURI } );
          return;
        }
        res.status(200).json(__res.body);
        return;
      });
    });
  } else if (req.params.device === COZMO) {
    if (!req.params.op || !req.params.demozone) {
      res.status(400).end();
      return;
    }
    var URI = util.format(BASEPORTURI, req.params.demozone.toUpperCase());
    dbClient.get(URI, (_err, _req, _res) => {
      if (_err) {
        var errorMsg = util.format("Error retrieving DEMOZONE information for %s: %s", req.params.demozone.toUpperCase(), _err.statusCode);
        log.error("", errorMsg);
        log.error("", "URI: " + URI);
        res.status(500).send(errorMsg);
        return;
      };
      if (!_res.body || !JSON.parse(_res.body).baseport) {
        var errorMsg = util.format("Error: No data retrieved for DEMOZONE %s", req.params.demozone.toUpperCase());
        log.error("", errorMsg);
        res.status(500).send(errorMsg);
        return;
      }
      var PROXYURL = APIPCSHOST + ":" + util.format(APIPPROXYPORT, JSON.parse(_res.body).baseport);
      log.verbose("", "PROXY URL: %s", PROXYURL);
      var proxyClient = restify.createJsonClient({
        url: PROXYURL,
        retry: false,
        connectTimeout: 1000,
        requestTimeout: 20000
      });
      var URI = util.format(COZMOCOMMANDS, req.params.demozone, req.params.op);
      dbClient.get(URI, (__err, __req, __res) => {
        if (__err) {
          var errorMsg = util.format("Error retrieving DEMOZONE COZMO COMMANDS for %s: %s", _req.params.demozone.toUpperCase(), __err.statusCode);
          log.error("", errorMsg);
          log.error("", "URI: " + URI);
          res.status(500).send(errorMsg);
          return;
        };
        if (!__res.body || __res.status === 404) {
          var errorMsg = util.format("COZMO commands for demozone %s, not found", req.params.demozone.toUpperCase());
          log.error("", errorMsg);
          res.status(400).send(errorMsg);
          return;
        }
        var commands
          , jBody = JSON.parse(__res.body);
        ;
        try {
          commands = JSON.parse(jBody.commands);
        } catch (e) {
          var errorMsg = util.format("Invalid JSON commands for demozone %s: %s", req.params.demozone.toUpperCase(), e.message);
          log.error("", errorMsg);
          res.status(400).send(errorMsg);
          return;
        }

        log.verbose("", "Sending COZMO %s ACTION request...", req.params.op);
        proxyClient.post(COZMOURI, commands, (___err, ___req, ___res) => {
          log.verbose("", "COZMO ACTION request callback invoked...");
          if (___err) {
            var errorMsg = util.format("Error in COZMO ACTION: %s", ___err.message);
            log.error("", errorMsg);
            // We return a 200 CODE in order to avoid any retry from BPEL
            res.status(200).json( { error: errorMsg, uri: PROXYURL + COZMOURI } );
            return;
          }
          res.status(200).json(___res.body);
          return;
        });
      });
    });
  } else {
    var errorMsg = util.format("Device %s not recognized. Ignoring", req.params.device);
    log.error("", errorMsg);
    res.status(400).end(errorMsg);
  }
});

app.use(restURI, router);
// REST stuff - END

server.listen(PORT, () => {
  _.each(router.stack, (r) => {
    log.info("","Listening for any '%s' request at http://localhost:%s%s%s", "POST", PORT, restURI, deviceURI);
  });
});
