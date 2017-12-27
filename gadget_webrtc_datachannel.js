/*jslint indent: 2*/
/*global rJS, RSVP, window*/
(function (rJS, window, RSVP) {
  "use strict";

  /////////////////////////////////////////////////////////////////
  // some variables
  /////////////////////////////////////////////////////////////////

  var DATA_CHANNEL_OPTION_DICT = {reliable: true};
  var CONNECT_OPTION_LIST = [
    {iceServers: []},
    {optional: [{DtlsSrtpKeyAgreement: true}]}
  ];
  var OFFER_CONSTRAINT_DICT = {
    mandatory: {
      OfferToReceiveAudio: false,
      OfferToReceiveVideo: false
    }
  };

  rJS(window)
    
    /////////////////////////////////////////////////////////////////
    // ready
    /////////////////////////////////////////////////////////////////
    .ready(function (g) {
      this.state_parameter_dict = {};
    })

    /////////////////////////////////////////////////////////////////
    // published methods
    /////////////////////////////////////////////////////////////////
    .allowPublicAcquisition("notifyDescriptionCalculated", function (args) {
      this.state_parameter_dict.description_defer.resolve(args[0]);
    })

    .allowPublicAcquisition("notifyDataChannelOpened", function () {
      this.state_parameter_dict.channel_defer.resolve();
    })

    /////////////////////////////////////////////////////////////////
    // declared methods
    /////////////////////////////////////////////////////////////////
    .declareMethod('createOffer', function (title) {
      var gadget = this,
        dict = gadget.state_parameter_dict,
        webrtc = dict.webrtc;
      return webrtc.createConnection.apply(webrtc, CONNECT_OPTION_LIST)
        .push(function () {
          return webrtc.createDataChannel(title, DATA_CHANNEL_OPTION_DICT);
        })
        .push(function () {
          return webrtc.createOffer(OFFER_CONSTRAINT_DICT);
        })
        .push(function (local_description) {
          return webrtc.setLocalDescription(local_description);
        })
        .push(function () {
          return dict.description_defer.promise;
        });
    })

    .declareMethod('registerAnswer', function (description) {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      return dict.webrtc.setRemoteDescription(description)
        .push(function () {
          return dict.channel_defer.promise;
        });
    })

    .declareMethod('createAnswer', function (title, description) {
      var gadget = this,
        dict = gadget.state_parameter_dict,
        webrtc = dict.webrtc;
      return webrtc.createConnection.apply(webrtc, CONNECT_OPTION_LIST)
        .push(function () {
          return webrtc.setRemoteDescription(description);
        })
        .push(function () {
          return webrtc.createAnswer(OFFER_CONSTRAINT_DICT);
        })
        .push(function (local_description) {
          return webrtc.setLocalDescription(local_description);
        })
        .push(function () {
          return dict.description_defer.promise;
        });
    })

    .declareMethod('waitForConnection', function () {
      return this.state_parameter_dict.channel_defer.promise;
    })

    .declareMethod('send', function () {
      var webrtc = this.state_parameter_dict.webrtc;
      return webrtc.send.apply(webrtc, arguments);
    })

    /////////////////////////////////////////////////////////////////
    // declared services
    /////////////////////////////////////////////////////////////////
    .declareService(function () {
      var gadget = this,
        dict = gadget.state_parameter_dict;
      return gadget.getDeclaredGadget('webrtc')
        .push(function (webrtc_gadget) {
          dict.webrtc = webrtc_gadget;
          dict.description_defer = RSVP.defer();
          dict.channel_defer = RSVP.defer();
        });
    });

}(rJS, window, RSVP));
