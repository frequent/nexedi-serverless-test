/*global window, rJS, document, RSVP, AudioContext */
/*jslint indent: 2, maxerr: 3 */
(function (window, rJS, document, RSVP, AudioContext) {
  "use strict";

  /////////////////////////////////////////////////////////////////
  // some variables
  /////////////////////////////////////////////////////////////////
  var FREQUENCIES = [392, 784, 1046.5, 1318.5, 1568, 1864.7, 2093, 2637];
  var AUDIO_CONTEXT;
  var OSCILLATORS;

  function encodeAndTransmitPaylod (my_gadget, my_target) {
    var dict = my_gadget.state_parameter_dict;
    var value = dict.input.value;
    if (value === '') {
      return;
    }
    AUDIO_CONTEXT = new AudioContext();
    OSCILLATORS = initialiseOsciallators();
    my_target.setAttribute("disabled", "disabled");
    return my_gadget.encode(value)
      .push(function () {
        my_target.removeAttribute("disabled", "disabled");
      })
      .push(undefined, function (error) {
        throw error;
      });
  }

  /////////////////////////////////////////////////////////////////
  // some functions
  /////////////////////////////////////////////////////////////////

  function setConfig(my_gadget, my_target) {
    my_target.parentElement.querySelector("span").textContent = my_target.value;
    if (my_target.getAttribute("name") === "ops-duration") {
      my_gadget.state_parameter_dict.duration = my_target.value;
    } else {
      my_gadget.state_parameter_dict.pause = my_target.value;
    }
  }

  function resetEncoder(my_gadget) {
    var dict = my_gadget.state_parameter_dict;
    AUDIO_CONTEXT = null;
    OSCILLATORS = null;
    dict.input.value = "";
  }

  function char2oscillators (char) {
    return OSCILLATORS.filter(function (_, i) {
      var charCode = char.charCodeAt(0);
      return charCode & (1 << i);
    });
  }

  function mute () {
    OSCILLATORS.forEach(function (osc) {
      osc.gain.value = 0;
    });
  }

  function initialiseOsciallators() {
    var master_gain = AUDIO_CONTEXT.createGain(),
      sinusoids,
      oscillators;
    master_gain.gain.value = 1.0/FREQUENCIES.length;

    // create nodes
    sinusoids = FREQUENCIES.map(function (f) {
      var oscillator = AUDIO_CONTEXT.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = f;
      oscillator.start();
      return oscillator;
    });
    oscillators = FREQUENCIES.map(function (f) {
      var volume = AUDIO_CONTEXT.createGain();
      volume.gain.value = 0;
      return volume;
    });
    
    // connect nodes
    sinusoids.forEach(function (sinus, i) {
      sinus.connect(oscillators[i]);
    });
    oscillators.forEach(function (osc) {
      osc.connect(master_gain);
    });
    master_gain.connect(AUDIO_CONTEXT.destination);
    return oscillators;
  }

  rJS(window)

    /////////////////////////////////////////////////////////////////
    // published methods
    /////////////////////////////////////////////////////////////////
    .allowPublicAcquisition("jio_post", function (my_param_list) {
      var storage = this.state_parameter_dict.storage;
      return storage.post.apply(storage, my_param_list);
    })
    .allowPublicAcquisition("jio_get", function (my_param_list) {
      var storage = this.state_parameter_dict.storage;
      return storage.get.apply(storage, my_param_list);
    })
    .allowPublicAcquisition("jio_allDocs", function (my_param_list) {
      var storage = this.state_parameter_dict.storage;
      return storage.allDocs.apply(storage, my_param_list);
    })

    /////////////////////////////////////////////////////////////////
    // declared methods
    /////////////////////////////////////////////////////////////////
    .declareMethod("encode", function (my_text) {
      var gadget = this,
        dict = gadget.state_parameter_dict,
        shift = parseInt(dict.pause, 10) + parseInt(dict.duration, 10);

      return RSVP.all(my_text.split('').map(function (char, i) {
        return new RSVP.Queue()
          .push(function () {
            return RSVP.delay(i * shift);
          })
          .push(function () {
            return gadget.encodeChar(char, dict.duration);
          });
      }).concat(RSVP.delay(my_text.length * shift)));
    })

    .declareMethod("encodeChar", function (my_char, my_duration) {
      var activeOscillators = char2oscillators(my_char);
      activeOscillators.forEach(function (osc) {
        osc.gain.value = 1;
      });
      return new RSVP.Queue() 
        .push(function () {
          return RSVP.delay(parseInt(my_duration, 10));
        })
        .push(function () {
          mute();
        });
    })

    /////////////////////////////////////////////////////////////////
    // declared services
    /////////////////////////////////////////////////////////////////
    .declareService(function () {
      var gadget = this;
      var element = gadget.element;
      return gadget.getDeclaredGadget("jio_gadget")
        .push(function (jio_gadget) {
          gadget.state_parameter_dict = {
            storage: jio_gadget,
            input: element.querySelector(".ops-encoder-input"),
            pause: element.querySelector(".ops-pause").value,
            duration: element.querySelector(".ops-duration").value,
          };
          jio_gadget.createJIO({
            type: "query",
            sub_storage: {
              type: "uuid",
              sub_storage: {
                "type": "indexeddb",
                "database": "serverless"
              }
            }
          });
        });
    })

    /////////////////////////////////////////////////////////////////
    // onEvent
    /////////////////////////////////////////////////////////////////
    .onEvent("change", function (event) {
      if (event.target.type === "range") {
        setConfig(this, event.target);
      }
    }, false, false)

    .onEvent("submit", function (event) {
      switch (event.target.getAttribute("name")) {
        case "ops-form-generate":
        case "ops-form-play":
          return encodeAndTransmitPaylod(this, event.target);
        case "ops-form-clear":
          return resetEncoder(this);
      }
    }, false, true);

}(window, rJS, document, RSVP, AudioContext));
