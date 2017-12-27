/*global window, rJS, document, RSVP, AudioContext, Uint8Array */
/*jslint indent: 2, maxerr: 3 */
(function (window, rJS, document, RSVP, AudioContext, Uint8Array) {
  "use strict";

  // kudos:
  // https://morsecode.scphillips.com/labs/decoder/
  // https://webrtchacks.com/the-minimum-viable-sdp/
  // https://github.com/WesselWessels/minisdp
  // https://github.com/fippo/minimal-webrtc
  // https://webrtchacks.com/wonder_webrtc_nni/
  // https://morsecode.scphillips.com/labs/decoder/

  /////////////////////////////////////////////////////////////////
  // some variables
  /////////////////////////////////////////////////////////////////

  var FREQUENCIES = [392, 784, 1046.5, 1318.5, 1568, 1864.7, 2093, 2637];
  var DECODER_AUDIO_CONTEXT;
  var DECODER_SAMPLE_RATE;
  var DECODER_FREQUENCY_BIN_COUNT;
  var DECODER_BUFFER;
  var DECODER_HZPERBIN;
  var DECODER_INDEX;
  var ENCODER_AUDIO_CONTEXT;
  var ENCODER_OSCILLATORS;

  /////////////////////////////////////////////////////////////////
  // some functions
  /////////////////////////////////////////////////////////////////

  function getElem(my_element, my_selector) {
    return my_element.querySelector(my_selector);
  }

  function encodeAndTransmitPaylod (my_gadget, my_target) {
    var dict = my_gadget.state_parameter_dict;
    var value = dict.encoder_input.value;
    if (value === '') {
      return;
    }
    ENCODER_AUDIO_CONTEXT = new AudioContext();
    ENCODER_OSCILLATORS = initialiseOsciallators();
    my_target.setAttribute("disabled", "disabled");
    return my_gadget.encode(value)
      .push(function () {
        my_target.removeAttribute("disabled", "disabled");
      })
      .push(undefined, function (error) {
        throw error;
      });
  }

  function char2oscillators (char) {
    return ENCODER_OSCILLATORS.filter(function (_, i) {
      var charCode = char.charCodeAt(0);
      return charCode & (1 << i);
    });
  }

  function mute () {
    ENCODER_OSCILLATORS.forEach(function (osc) {
      osc.gain.value = 0;
    });
  }

  function initialiseOsciallators() {
    var master_gain = ENCODER_AUDIO_CONTEXT.createGain(),
      sinusoids,
      oscillators;
    master_gain.gain.value = 1.0/FREQUENCIES.length;

    // create nodes
    sinusoids = FREQUENCIES.map(function (f) {
      var oscillator = ENCODER_AUDIO_CONTEXT.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = f;
      oscillator.start();
      return oscillator;
    });
    oscillators = FREQUENCIES.map(function (f) {
      var volume = ENCODER_AUDIO_CONTEXT.createGain();
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
    master_gain.connect(ENCODER_AUDIO_CONTEXT.destination);
    return oscillators;
  }

  function stopListening(my_gadget) {
    return my_gadget.state_parameter_dict.audio_stream.getTracks()
      .forEach(function(track) {
        track.stop();
      });    
  }

  function startListening(my_gadget, my_event) {
    var dict = my_gadget.state_parameter_dict;
    if (dict.connected) {
      dict.connected = null;
      getElem(my_event.target, "button").textContent = "Listen";
      return;
    }
    return new RSVP.Queue()
      .push(function () {
        DECODER_AUDIO_CONTEXT = new AudioContext();
        dict.audio_analyser = setAnalyser();
        return navigator.mediaDevices.getUserMedia({audio:true});
      })
      .push(function (stream) {
        var microphone = DECODER_AUDIO_CONTEXT.createMediaStreamSource(stream);
        dict.audio_stream = stream;
        DECODER_BUFFER = new Uint8Array(dict.audio_analyser.frequencyBinCount);
        microphone.connect(dict.audio_analyser);
        DECODER_SAMPLE_RATE = DECODER_AUDIO_CONTEXT.sampleRate;
        my_event.target.querySelector("button").textContent = "Stop";
        dict.connected = true;
        dict.previous_state = 0;
        dict.duplicates = 0;
        return my_gadget.iterate();
      })
      .push(undefined, function (error) {
        dict.status_message.textContent = "Microphone is required";
        throw error;
      });
  }

  function setAnalyser() {
    var analyser = DECODER_AUDIO_CONTEXT.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.0;
    analyser.minDecibels = -58;
    DECODER_FREQUENCY_BIN_COUNT = analyser.frequencyBinCount;
    return analyser;
  }


  function resetAudioDecoder(my_gadget) {
    var dict = my_gadget.state_parameter_dict;
    dict.decoder_output.value = "";
    dict.previous_state = 0;
    dict.duplicates = 0;
    dict.audio_analyser = null;
    delete dict.connected;
    DECODER_INDEX = null;
    DECODER_HZPERBIN = null;
    DECODER_BUFFER = null;
    DECODER_FREQUENCY_BIN_COUNT = null;
    DECODER_SAMPLE_RATE = null;
    DECODER_AUDIO_CONTEXT = null;
  }

  function resetAudioEncoder(my_gadget) {
    var dict = my_gadget.state_parameter_dict;
    ENCODER_AUDIO_CONTEXT = null;
    ENCODER_OSCILLATORS = null;
    dict.encoder_input.value = "";
  }

  function setOutput(my_state, my_dict) {
    my_dict.decoder_output.value += String.fromCharCode(my_state % 256);
  }

  function trace(my_state, my_dict) {
    var str = my_state.toString(2);
    var pad = "0b00000000";
    var text = pad.substring(0, pad.length - str.length) + str;
    my_dict.code.textContent = text;
  }

  function isActive(my_value, my_dict) {
    var threshold = my_dict.bin_threshold;
    return my_value > threshold;
  }
 
  function getState(my_dict) {
    return FREQUENCIES.map(frequencyBinValue).reduce(function (acc, val, idx) {
      if (isActive(val, my_dict)) {
        acc += (1 << idx);
      }
      return acc;
    }, 0);
  }

  function frequencyBinValue (f) {
    // state is too low, looping over f = 392, 784, 1046.5, 1318.5, 1568, 1864.7, 2093, 2637
    // audio_analyser.frequencyBinCount is always 256, sample rate 48000
    // hzperbin = 48000 / 2 * 256 = 93.75
    // index = (f + 93.75/2) / 93.75
    DECODER_HZPERBIN = DECODER_SAMPLE_RATE / (2 * DECODER_FREQUENCY_BIN_COUNT);
    DECODER_INDEX = parseInt((f + DECODER_HZPERBIN/2) / DECODER_HZPERBIN);
    return DECODER_BUFFER[DECODER_INDEX];
  }

  function setConfig(my_gadget, my_target) {
    getElem(my_target.parentElement, "span").textContent = my_target.value;
    switch (my_target.getAttribute("name")) {
      case "ops-duration":
        my_gadget.state_parameter_dict.duration = +my_target.value;
        break;
      case "ops-pause":
        my_gadget.state_parameter_dict.pause = +my_target.value;
        break;
      case "ops-bin-value-threshold":
        my_gadget.state_parameter_dict.bin_threshold = +my_target.value;
        break;
      case "ops-duplicate-state-threshold":
        my_gadget.state_parameter_dict.duplicate_threshold = +my_target.value;
        break;
      default:
        console.log(my_target.getAttribute("name"))
        break;
    }
  }
  
  // querying
  function clearList(my_list) {
    while (my_list.firstChild) {
      my_list.removeChild(my_list.firstChild);
    }
  }

  function queryRecordOverWebrtc(my_gadget, my_event) {
    var target = my_event.target,
      search_string = target.elements.field_search_string.value,
      status = my_gadget.state_parameter_dict.status_message,
      list = my_gadget.state_parameter_dict.result_list;

    if (!search_string) {
      status.textContent = "Please enter search string.";
      return;
    }
    clearList(list);
    status.textContent = "Querying storage...";
    return my_gadget.shared_jio_allDocs({
      "query": 'first:"%' + search_string + '%" OR last:"%' + search_string + '%"',
    })
    .push(function (my_result) {
      return RSVP.all([my_result.data.rows.map(function (item) {
        my_gadget.shared_jio_get(item.id);
      })]);
    })
    .push(function (my_result_list) {
      var fragment = document.createDocumentFragment();
      my_result_list.forEach(function (item) {
        result = document.createElement("li");
        result.textContent = item.first + " " + item.last;
        fragment.appendChild(result);
      });
      list.appendChild(fragment);
    });
  }

  function createRecordOverWebrtc(my_gadget, my_event) {
    var target = my_event.target,
      first = target.elements.field_first_name.value,
      last = target.elements.field_last_name.value,
      status =  my_gadget.state_parameter_dict.status_message;

    if (first && last) {
      return new RSVP.Queue()
        .push(function () {
          status.textContent = "Posting to storage...";
          return my_gadget.shared_jio_post({"first": first, "last": last});
        })
        .push(function (my_storage_reply) {
          status.textContent = "ok, record created: " + my_storage_reply;
        });
    }
    status.textContent = "Please enter first and last name.";
  }

  rJS(window)

    /////////////////////////////////////////////////////////////////
    // ready
    /////////////////////////////////////////////////////////////////
    .ready(function () {
      this.state_parameter_dict = {};
    })

    /////////////////////////////////////////////////////////////////
    // declared methods
    /////////////////////////////////////////////////////////////////
    
    .declareMethod('shared_jio_create', function (my_param_list) {
      var storage = this.state_parameter_dict.remote_storage;
      return storage.createJio(my_param_list);
    })
    .declareMethod("shared_jio_post", function (my_param_dict) {
      var storage = this.state_parameter_dict.remote_storage;
      return storage.post(my_param_dict);
    })
    .declareMethod("shared_jio_get", function (my_param_dict) {
      var storage = this.state_parameter_dict.remote_storage;
      return storage.get(my_param_dict);
    })
    .declareMethod("shared_jio_allDocs", function (my_param_dict) {
      var storage = this.state_parameter_dict.remote_storage;
      return storage.allDocs(my_param_dict);
    })

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

    .declareMethod("generateWebRtcOffer", function () {
      var gadget = this;
      var dict = gadget.state_parameter_dict;
      return gadget.shared_jio_create()
        .push(function (payload) {
          dict.encoder_input.value = payload;
        });
    })

    /////////////////////////////////////////////////////////////////
    // declared jobs
    /////////////////////////////////////////////////////////////////
    .declareJob("iterate", function () {
      var gadget = this;
      var dict = gadget.state_parameter_dict;
      if (dict.connected === null) {
        return stopListening(gadget);
      }
      return new RSVP.Queue()
        .push(function () {
          return RSVP.delay(1);
        })
        .push(function () {
          var duplicate_threshold = dict.duplicate_threshold;
          var state;
          dict.audio_analyser.getByteFrequencyData(DECODER_BUFFER);
          state = getState(dict);
          if (state === dict.previous_state) {
            dict.duplicates++;
          } else {
            trace(state, dict);
            dict.previous_state = state;
            dict.duplicates = 0;
          }
          console.log(state, dict.duplicates, duplicate_threshold)
          if (dict.duplicates === duplicate_threshold) {
            setOutput(state, dict);
          }
          return gadget.iterate();
        });
    })

    /////////////////////////////////////////////////////////////////
    // declared services
    /////////////////////////////////////////////////////////////////
    .declareService(function () {
      var gadget = this;
      var dict = gadget.state_parameter_dict;
      var elem = gadget.element;

      return gadget.getDeclaredGadget("webrtc_access_storage")
        .push(function (access_gadget) {
          dict.result_list = getElem(elem, ".ops-result-list");
          dict.status_message = getElem(elem, ".ops-status");
          dict.remote_storage = access_gadget;
          dict.decoder_output = getElem(elem, ".ops-decoder-output");
          dict.code = getElem(elem, "code");
          dict.encoder_input = getElem(elem, ".ops-encoder-input");
          dict.bin_threshold = +getElem(elem, ".ops-bin-value-threshold").value;
          dict.duplicate_threshold = +getElem(elem, ".ops-duplicate-state-threshold").value;
          dict.pause = +getElem(elem, ".ops-pause").value;
          dict.duration = +getElem(elem, ".ops-duration").value;
        });
    })
  
    /////////////////////////////////////////////////////////////////
    // onEvent
    /////////////////////////////////////////////////////////////////
    .onEvent("change", function (my_event) {
      if (event.target.type === "range") {
        setConfig(this, event.target);
      }
    }, false, false)

    .onEvent("submit", function (my_event) {
      switch (my_event.target.getAttribute("name")) {
        case "ops-form-config":
          return;
        case "ops-form-listen":
          return startListening(this, my_event);
        case "ops-form-clear-decoder":
          return resetAudioDecoder(this);
        case "ops-form-create":
          return createRecordOverWebrtc(this, my_event);
        case "ops-form-query":
          return queryRecordOverWebrtc(this, my_event);
        case "ops-form-generate":
          return this.generateWebRtcOffer();
        case "ops-form-play":
          return encodeAndTransmitPaylod(this, my_event.target);
        case "ops-form-clear-encoder":
          return resetAudioEncoder(this);
      }
    }, false, true);

}(window, rJS, document, RSVP, AudioContext, Uint8Array));
