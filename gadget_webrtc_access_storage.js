/*global window, rJS, document, RSVP, JSON, btoa, atob */
/*jslint indent: 2, maxerr: 3 */
(function (window, rJS, document, RSVP, JSON, btoa, atob) {
  "use strict";

  /////////////////////////////////////////////////////////////////
  // some variables
  /////////////////////////////////////////////////////////////////
  var TIMEOUT = 60000;
  var COMMA = [1, 46, 71, 76];
  var MORSE = {
  
    "A": "._",    "B": "_...",    "C": "_._.",    "D": "_..",
    "E": ".",     "F": ".._.",    "G": "__.",     "H": "....",
    "I": "..",    "J": ".___",    "K": "_._",     "L": "._..",
    "M": "__",    "N": "_.",      "O": "___",     "P": ".__.",
    "Q": "__._",  "R": "._.",     "S": "...",     "T": "_",
    "U": ".._",   "V": "..._",    "W": ".__",     "X": "_.._",
    "Y": "_.__",  "Z": "__..",

    "1": ".____", "2": "..___",   "3": "...__",   "4": "...._",
    "5": ".....", "6": "_....",   "7": "__...",   "8": "___..",
    "9": "____.", "0": "_____",

    ".": "._._._",      // AAA, RK
    "'": ".___.",       // WG
    "!": "_._._____.",  // KW, MN
    ")": "_.__._",      // NG, KN
    "(": "_.__._",      // NQ, KK
    "&": "._...",       // AS
    ";": "_._._.",      // NNN, KR
    '"': "._.._.",      // RR
    "$": "..._.._",     // SX
    "@": ".__._.",      // AC
    "_": "..__._",      // UK

    ",": "__..__",      // MIM, GW
    "?": "..__..",      // IMI, UD
    "/": "_.._.",       // NR
    ":": "___...",      // OS
    "=": "_..._",       // NU
    "+": "._._.",       // AR
    "-": "_...._",      // DU
  
  };

  // tokens will be base64 encoded, so not all morse characters are used. Thus
  // lowercase flag: '
  var LOWER = ".____.";
  // character separater: ;
  var SPACE = "_._._.";

  /////////////////////////////////////////////////////////////////
  // some methods
  /////////////////////////////////////////////////////////////////

  // decoding/encoding
  function convertTextToMorse(my_message) {
    return my_message.split("").map(function (char) {
      return (MORSE[char] || LOWER + MORSE[char.toUpperCase()]); 
    }).join(SPACE) + SPACE;
  }

  function findInMorse(my_morse) {
    var key;
    for (key in MORSE) {
      if (MORSE.hasOwnProperty(key) && MORSE[key] === my_morse) {
        return key;
      }
    }
  }

  function getIndex(my_text, my_previous_index) {
    var base = my_text.indexOf(SPACE, my_previous_index);
    if (my_previous_index) {
      if (my_text.substring(0, base) === LOWER) {
        return my_text.indexOf(SPACE, base + 1);
      }
    }
    return base;
  }

  function getCharacter(my_snip, my_upperbound) {
    var candidate = my_snip.substring(0, my_upperbound);
    if (candidate === LOWER) {
      return;
    }
    if (candidate.indexOf(LOWER) === 0) {
      return findInMorse(candidate.substring(6)).toLowerCase();
    }
    return findInMorse(candidate);
  }

  // https://stackoverflow.com/a/4549997/
  function repeat(str, times) {
    return new Array(times + 1).join(str);
  }

  function getLookAhead(my_code, my_i) {
    var j = 0;
    var lookahead;
    var match_string = "_.";
    var len = my_code.length;
    while (my_i < len) {
      lookahead = my_code[my_i + j + 1] + my_code[my_i + j + 2];
      if (lookahead === match_string) {
        j += 2;
      } else {
        return j/2;
      }
    }
  }

  function getSplitList(my_output, my_current_pos) {
    var split_list = [];
    while (my_current_pos > 0) {
      my_current_pos -= 1;
      if (my_output[my_current_pos].length > 1) {
        split_list.push(my_current_pos);
      }
    }
    return split_list;
  }

  function assembleToken(my_output) {
    var token = '';
    Object.keys(my_output).forEach(function (key) {
      token += my_output[key][0]["character"];
    });
    console.log(token)
    return token;
  }

  function convertMorseToText(my_code) {
    console.log(my_code, my_code.length)
    var len = my_code.length;
    var output = {};
    var character_position = 0;
    var snip = "";
    var i = 0;
    var j;
    var breaker;
    var character_options;
    var node;
    var split_list;
    var relevant_split;
    var character_total;
    var character_last;
    var result_list = [];

    while (i < len) {
      snip += my_code[i];
      //console.log(i, snip)
      breaker = getIndex(snip);
      if (breaker > -1) {
        output[character_position] = [];

        // where does character end and separator start
        character_options = 1 + getLookAhead(my_code, i);
        for (j = 1; j <= character_options; j += 1) {
          node = {
            "snip": snip + repeat("_.", j - 1),
            "pos": character_position,
            "i": i + (j - 1) * 2,
            "shift": (j - 1) * 2
          };

          try {
            node.character = getCharacter(node.snip, breaker + node.shift);
            
            // one candidate only (url:port) signals pending end
            if (node.pos > 80 && node.character === ":") {
              character_total = node.pos + 4;
            }

            // limit branches, commas must be at specified locations
            if (node.character === "," && COMMA.indexOf(character_position) === -1) {
              node.character = undefined;
            }

            // wrong branches eventually result in unmatchable characters
            if (node.character === undefined) {
              continue;
            } else {
              console.log(character_position, node.snip, getCharacter(node.snip, breaker + node.shift), i, node.i)
            }
          // unmatchable lowercase character throw
          } catch (e) {
            continue;
          }
          output[character_position].push(node);
        }
        if (character_total && node.pos === character_total) {
          output[character_position].forEach(function (curr_char, index) {
            if (curr_char.i !== len - 1) {
              output[character_position].shift();
              i = output[character_position][0].i;
            }
          });
        }

        // "N" rule, breaker on 0, get more tokens
        if (breaker === 0 && output[character_position].length > 0) {
          //console.log("ZERO BREAKER, continue from", output[character_position], output[character_position][0], output[character_position][0].i)
          i = output[character_position][0].i;
        }
        if (output[character_position].length === 0) {
          split_list = getSplitList(output, character_position);
          relevant_split = split_list[0];
          if (relevant_split === undefined) {
            console.log("we're done");
            break;
          }
          console.log("DEADEND, pos", character_position, "i:", i, "relevant_split", relevant_split, "splits:",  getSplitList(output, character_position))
          output[relevant_split].shift();
          character_position = relevant_split;
          i = output[relevant_split][0].i;
          console.log("setting to char-pos:", character_position, "character:", output[relevant_split][0].character, "i=", output[relevant_split][0].i)
        }
        snip = "";
        character_position += 1;
        if (i === len - 1) {
          result_list.push(assembleToken(output));
          // continue from last split
          split_list = getSplitList(output, character_position);
          console.log("EOF, splits left:", split_list)
          if (split_list.length === 0) {
            console.log("we're done")
            break;
          } else {
            relevant_split = split_list[0];
            output[relevant_split].shift();
            character_position = relevant_split;
            i = output[relevant_split][0].i;
            console.log("jumping back to char-pos:", character_position, "character:", output[relevant_split][0].character, "i=", output[relevant_split][0].i)
          }
        }
      }
      i += 1;
    }
    console.log(result_list)
    // I don't know whether other options are valid, just because there are 
    // splits left does not mean they work in combination. So to reduce the
    // remaining options I would have to walk through the remaining tree again?
    // and see whether there are any branches which do not work. Surely there
    // are...
    /*
    var option_list = Object.keys(output).reduce(function (token_list, key) {
      var clone_list = [];
      var char_list = output[key].forEach(function (char) {
        var skip;
        token_list.forEach(function (token) {
          token += char.character;
          //if (token.length === 45) {
          //  try {
          //    binify(token.substring(2,46))
          //  } catch (e) {
          //    console.log("OUT", token.substring(2,46))
          //    skip = e;
          //  }
          //}
          //if (!skip) {
          clone_list.push(token.slice(0));
          //}
        });  
      });
      return clone_list;
      console.log(option_list)
    }, ['']);
    */
    
    
  }

  function d2h (d) {
    var temp = d.toString(16);
    if (d < 16) {
      return '0'+temp;
    }
    return temp;
  }

  function base32decode(my_num){
    return parseInt(my_num,32);
  }
        
  function base32encode (my_num) {
    return parseInt(my_num, 10).toString(32);
  }

  function encodeIp(my_ip) {
    return my_ip.split(".").reduce(function (pass, block) {
      return pass += d2h(parseInt(block));
    }, "");
  }

  function decodeIp(my_str) {
    var arr = []
    var i;
    var len = my_str.length/2;
    var temp;
    for (i = 0; i < len; i += 1) {
      temp = my_str.substring(i*2, (i+1)*2);
      arr.push(parseInt(temp, 16));
    }
    return arr.join(".");
  }

  function binify(item_list) {
    return atob(item_list).split('').map(function (c) {
      var d = c.charCodeAt(0);
      var e = c.charCodeAt(0).toString(16).toUpperCase();
      if (d < 16) {
        e = '0' + e;
      }
      return e;
    }).join(':');
  }

  function deflateToken(my_description) {
    var token = JSON.parse(my_description);
    var type = token.type === 'offer' ? 'O': 'A';
    var ice_password;
    var ice_fragment;
    var fingerprint;
    var temp_list;
    var candidate_list;
    var payload = token.sdp.split('\r\n').forEach(function (line) {
      var split = line.split(":");
      if (split[0] === 'a=ice-pwd') {
        ice_password = split[1];
      }
      if (split[0] === 'a=ice-ufrag') {
        ice_fragment = split[1];
      }
      if (split[0] === 'a=fingerprint') {
        fingerprint = btoa(String.fromCharCode.apply(
          String, line.split(" ")[1].split(":").map(function (h) {
            return parseInt(h, 16);
          }))
        );
      }
      if (split[0] === 'a=candidate' && split[1].indexOf('host') > -1) {
        temp_list = split[1].split(' ');
        candidate_list = temp_list.map(function (item, index) {
          if (item.indexOf(".") > -1) {
            return encodeIp(item) + ':' + base32encode(temp_list[index + 1]);
          }
        }).filter(Boolean)[0];
      }
    });
    return [type, fingerprint, ice_password, ice_fragment, candidate_list].join(",");
  }

  function inflateToken(my_token) {
    var token_element_list = my_token.split(",");
    var type = token_element_list[0] === 'O' ? 'offer' : 'answer';
    var ice_pwd = token_element_list[2];
    var ice_ufrag = token_element_list[3];
    var fingerprint = binify(token_element_list[1]);
    var candidate = token_element_list[4].split(":");
    var ip = decodeIp(candidate[0]);
    var port = base32decode(candidate[1]);
    var sdp = [
      'v=0',
      'o=- 4394508073601965658 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=msid-semantic: WMS',
      'm=application ' + port + ' DTLS/SCTP 5000',
      'c=IN IP4 ' + ip,
    ];
    sdp.push('a=candidate:1796882240 1 udp 2113937151 '+ ip + ' ' + port + ' typ host generation 0 network-cost 50');
    sdp.push('a=ice-ufrag:' + ice_ufrag);
    sdp.push('a=ice-pwd:' + ice_pwd);
    sdp.push('a=fingerprint:sha-256 ' + fingerprint);
    if (type === 'answer') {
        sdp.push('a=setup:active');
    } else {
        sdp.push('a=setup:actpass');
    }
    sdp.push('a=mid:data');
    sdp.push('a=sctpmap:5000 webrtc-datachannel 1024');
    return {type: type, sdp: sdp.join('\r\n') + '\r\n'};
  }

  function S4() {
    return ('0000' + Math.floor(
      Math.random() * 0x10000 /* 65536 */
    ).toString(16)).slice(-4);
  }

  function UUID() {
    return S4() + S4() + "-" +
      S4() + "-" +
      S4() + "-" +
      S4() + "-" +
      S4() + S4() + S4();
  }

  function wrapJioAccess(my_gadget, my_method_name, my_argument_list) {
    var dict = my_gadget.state_parameter_dict;
    return my_gadget.getDeclaredGadget('gadget_webrtc_datachannel.html')
      .push(function (rtc_gadget) {
        dict.message_count += 1;
        dict.message_dict[dict.message_count] = RSVP.defer();
        return RSVP.all([
          rtc_gadget.send(JSON.stringify({
            id: dict.message_count,
            type: "jio_query",
            method_name: method_name,
            argument_list: Array.prototype.slice.call(argument_list)
          })),
          RSVP.any([
            RSVP.delay(TIMEOUT),
            dict.message_dict[dict.message_count].promise
          ])
        ]);
      })
      .push(function (result_list) {
        return result_list[1];
      });
  }

  function declareSubGadget(my_gadget, my_url) {
    var element = my_gadget.element.querySelector("." + my_url.split(".")[0]);
    var new_element = document.createElement("div");

    element.innerHTML = "";
    element.appendChild(new_element);
    return my_gadget.declareGadget(my_url, {
      element: element,
      scope: my_url,
      sandbox: "public"
    });
  }

  rJS(window)

    /////////////////////////////////////////////////////////////////
    // ready
    /////////////////////////////////////////////////////////////////
    .ready(function () {
      var gadget = this; 
      gadget.state_parameter_dict = {};
    })

    /////////////////////////////////////////////////////////////////
    // published methods
    /////////////////////////////////////////////////////////////////
    .allowPublicAcquisition("notifyDataChannelMessage", function (argument_list) {
      var dict = this.state_parameter_dict,
        json = JSON.parse(argument_list[0]);
      if (json.type === "jio_response") {
        dict.message_dict[json.id].resolve(json.result);
      } else if (json.type === "error") {
        dict.message_dict[json.id].reject(json.result);
      }
    })

    .declareMethod('createJio', function (options) {
      var gadget = this,
        dict = gadget.state_parameter_dict,
        rtc_gadget;
      
      dict.uuid = UUID();
      dict.answer_defer = RSVP.defer();
      dict.message_count = 0;
      dict.message_dict = {};
      
      return declareSubGadget(gadget, 'gadget_webrtc_datachannel.html')
        .push(function (webrtc_gadget) {
          rtc_gadget = webrtc_gadget;
          return rtc_gadget.createOffer(dict.uuid);
        })
        .push(function (description) {
          console.log(description)
          console.log(deflateToken(description))
          var morse = convertTextToMorse(deflateToken(description))
          console.log(convertMorseToText(morse))
          return deflateToken(description);
          // https://webrtchacks.com/the-minimum-viable-sdp/
          /*
          return RSVP.any([
            new RSVP.Queue()
              .push(function () {
                return RSVP.delay(TIMEOUT);
              })
              .push(undefined, function () {
                throw new Error("No remote WebRTC connection available");
              }),
            RSVP.all([
              // send sound => shrink this?
              //socket_gadget.send(JSON.stringify({from: dict.uuid, action: "offer", data: description})),
              dict.answer_defer.promise
            ])
          ]);
          
        })
        .push(function (response_list) {
          return rtc_gadget.registerAnswer(response_list[1]);
        */
        });
        
    })

    .declareMethod('allDocs', function () {
      return wrapJioAccess(this, 'allDocs', arguments);
    })
    .declareMethod('get', function () {
      return wrapJioAccess(this, 'get', arguments);
    })
    .declareMethod('put', function () {
      return wrapJioAccess(this, 'put', arguments);
    })
    .declareMethod('post', function () {
      return wrapJioAccess(this, 'post', arguments);
    })
    .declareMethod('remove', function () {
      return wrapJioAccess(this, 'remove', arguments);
    });

}(window, rJS, document, RSVP, JSON, btoa, atob));
