/*jslint indent: 2*/
/*global rJS, RSVP, window*/
(function (rJS, RSVP, window) {
  "use strict";

  /////////////////////////////////////////////////////////////////
  // some variables
  /////////////////////////////////////////////////////////////////
  var RTC_PEER_CONNECTION = window.RTCPeerConnection ||
                          window.mozRTCPeerConnection ||
                          window.webkitRTCPeerConnection ||
                          window.msRTCPeerConnection;
  var RTC_SESSION_DESCRIPTION = window.RTCSessionDescription ||
                            window.mozRTCSessionDescription ||
                            window.webkitRTCSessionDescription ||
                            window.msRTCSessionDescription;

  /////////////////////////////////////////////////////////////////
  // some methods
  /////////////////////////////////////////////////////////////////
  function deferServerConnection(my_gadget) {
    deferServerDisconnection(my_gadget);
  }

  function deferServerDisconnection(my_gadget) {
    var dict = my_gadget.state_parameter_dict;
    enqueueDefer(my_gadget, function () {

      // Try to auto connection
      if (dict.connection !== undefined) {
        dict.connection.disconnect();
        delete dict.connection;
      }
    });
  }

  function enqueueDefer(my_gadget, my_callback) {
    var dict = my_gadget.state_parameter_dict;
    var deferred = dict.current_deferred;

    // Unblock queue
    if (deferred !== undefined) {
      deferred.resolve("Another event added");
    }

    // Add new callback
    try {
      dict.service_queue.push(my_callback);
    } catch (error) {
      throw new Error("Connection gadget already crashed... " +
                      dict.service_queue.rejectedReason || error.split('\n')[0]);
    }

    // Block the queue
    deferred = RSVP.defer();
    dict.current_deferred = deferred;
    dict.service_queue.push(function () {
      return deferred.promise;
    });
  }

  function deferOnIceCandidate(candidate) {
    var gadget = this,
      dict = gadget.state_parameter_dict;
    enqueueDefer(gadget, function () {

      // Firing this callback with a null candidate indicates that
      // trickle ICE gathering has finished, and all the candidates
      // are now present in pc.localDescription.  Waiting until now
      // to create the answer saves us from having to send offer +
      // answer + iceCandidates separately.
      if (candidate.candidate === null) {
        return gadget.notifyDescriptionCalculated(JSON.stringify(
          dict.connection.localDescription)
        );
      }
    });
  }

  function deferDataChannelOnOpen() {
    var gadget = this;
    enqueueDefer(gadget, function () {
      return gadget.notifyDataChannelOpened();
    });
  }

  function deferDataChannelOnClose() {
    var gadget = this;
    enqueueDefer(gadget, function () {
      return gadget.notifyDataChannelClosed();
    });
  }

  function deferDataChannelOnMessage(my_evt) {
    var gadget = this;
    enqueueDefer(gadget, function () {
      return gadget.notifyDataChannelMessage(my_evt.data);
    });
  }

  function deferErrorHandler(my_error) {
    var gadget = this;
    enqueueDefer(gadget, function () {
      throw my_error;
    });
  }

  function listenToChannelEvents(my_gadget) {
    var dict = my_gadget.state_parameter_dict;
    dict.channel.onopen = deferDataChannelOnOpen.bind(my_gadget);
    dict.channel.onclose = deferDataChannelOnClose.bind(my_gadget);
    dict.channel.onmessage = deferDataChannelOnMessage.bind(my_gadget);
    dict.channel.onerror = deferErrorHandler.bind(my_gadget);
  }

  rJS(window)

    /////////////////////////////////////////////////////////////////
    // ready
    /////////////////////////////////////////////////////////////////
    .ready(function () {
      this.state_parameter_dict = {};
    })

    /////////////////////////////////////////////////////////////////
    // acquired methods
    /////////////////////////////////////////////////////////////////
    .declareAcquiredMethod('notifyDescriptionCalculated',
                           'notifyDescriptionCalculated')
    .declareAcquiredMethod('notifyDataChannelOpened',
                           'notifyDataChannelOpened')
    .declareAcquiredMethod('notifyDataChannelMessage',
                           'notifyDataChannelMessage')
    .declareAcquiredMethod('notifyDataChannelClosed',
                           'notifyDataChannelClosed')

    /////////////////////////////////////////////////////////////////
    // declared methods
    /////////////////////////////////////////////////////////////////
    .declareMethod('createConnection', function (my_config, my_constraints) {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      dict.connection = new RTC_PEER_CONNECTION(my_config, my_constraints);
      dict.connection.onicecandidate = deferOnIceCandidate.bind(gadget);
      dict.connection.ondatachannel = function (evt) {
        dict.channel = evt.channel;
        listenToChannelEvents(gadget);
      };
    })

    // XXX Improve to support multiple data channel
    .declareMethod('createDataChannel', function (my_title, my_options) {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      dict.channel = dict.connection.createDataChannel(my_title, my_options);
      listenToChannelEvents(gadget);
    })

    .declareMethod('createOffer', function (my_constraints) {
      return this.state_parameter_dict.connection.createOffer(my_constraints);
    })

    .declareMethod('setRemoteDescription', function (my_description) {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      return new RSVP.Promise(function (resolve, reject) {
        dict.connection.setRemoteDescription(
          new RTC_SESSION_DESCRIPTION(JSON.parse(my_description)),
          resolve,
          reject
        );
      });
    })

    .declareMethod('setLocalDescription', function (my_description) {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      return new RSVP.Promise(function (resolve, reject) {
        dict.connection.setLocalDescription(
          new RTC_SESSION_DESCRIPTION(my_description),
          resolve,
          reject
        );
      });
    })

    .declareMethod('createAnswer', function (my_constraints) {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      return new RSVP.Promise(function (resolve, reject) {
        dict.connection.createAnswer(resolve, reject, my_constraints);
      });
    })

    .declareMethod('send', function (my_message) {
      this.state_parameter_dict.channel.send(my_message);
    })

    // XXX Of course, this will fail if connection is not open yet...
    .declareMethod('close', function () {
      var dict = this.state_parameter_dict;
      dict.channel.close();
      dict.connection.close();
      delete dict.channel;
      delete dict.connection;
    })

    /////////////////////////////////////////////////////////////////
    // declared services
    /////////////////////////////////////////////////////////////////
    .declareService(function () {
      var gadget = this;
      var dict = gadget.state_parameter_dict;

      dict.service_queue = new RSVP.Queue();
      deferServerConnection(gadget);

      return new RSVP.Queue()
        .push(function () {
          return dict.service_queue;
        })
        .push(function () {

          // Always throw if connection stops            
          throw new Error("Service should not have been stopped!");
        })
        .push(undefined, function (error) {
          
          // Always disconnect in case of error
          if (dict.connection !== undefined) {
            dict.connection.close();
          }
          throw error;
        });
    });

}(rJS, RSVP, window));
