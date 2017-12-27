/*global window, rJS, document, RSVP, console, DOMException, JSON */
/*jslint indent: 2, maxerr: 3 */
(function (window, rJS, document, RSVP, console, DOMException, JSON) {
  "use strict";

  /////////////////////////////////////////////////////////////////
  // some variables
  /////////////////////////////////////////////////////////////////
  var ARR = [];
  var IP_REGEX = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/;

  /////////////////////////////////////////////////////////////////
  // some methods
  /////////////////////////////////////////////////////////////////
  function updateInfo(my_gadget) {
    var scope_list = getWebRTCScopeList(my_gadget),
      dict = my_gadget.state_parameter_dict,
      result = "";
    scope_list.forEach(function (item) {
      result += dict.scope_ip[item] + "\n"; 
    });
    dict.info.textContent = result;
    dict.peer_count.textContent = scope_list.length;
  }
  
  function getWebRTCScopeList(my_gadget) {
    var node_list = my_gadget.state_parameter_dict.channel_list.childNodes;
    return ARR.slice.call(node_list).map(function (element) {
      element.getAttribute("data-gadget-scope");
    });
  }  

  function dropSubGadget(gadget, scope) {
    return gadget.getDeclaredGadget(scope)
      .push(function (gadget_to_drop) {
        var element = gadget_to_drop.element;
        if (element.parentElement) {
          element.parentElement.removeChild(element);
        }
        delete gadget.state_parameter_dict.scope_ip[scope];
        return gadget.dropGadget(scope);
      });
  }

  function sendWebRTC(gadget, rtc_gadget, scope, message) {
    return rtc_gadget.send(message)
      .push(undefined, function (error) {
        if ((error instanceof DOMException) && (error.name === 'InvalidStateError')) {
          return dropSubGadget(gadget, scope)
            .push(function () {
              return updateInfo(gadget);
            }, function (error) {
              console.log("-- Can not drop remote subgadget " + scope);
              console.log(error);
              return;
            });
        }
        throw error;
      });
  }

  rJS(window)

    /////////////////////////////////////////////////////////////////
    // ready
    /////////////////////////////////////////////////////////////////
    .ready(function () {
      var element = this.element;
      this.state_parameter_dict = {
        counter: 0,
        connecting: false,
        scope_ip: {},
        peer_count: element.querySelector(".ops-peer-count"),
        info: element.querySelector(".ops-info"),
        channel_list: element.querySelector(".ops-data-channel-list")
      };
      return updateInfo(gadget);
    })

    /////////////////////////////////////////////////////////////////
    // declared methods
    /////////////////////////////////////////////////////////////////
    .declareAcquiredMethod("jio_allDocs", "jio_allDocs")
    .declareAcquiredMethod("jio_post", "jio_post")
    .declareAcquiredMethod("jio_put", "jio_put")
    .declareAcquiredMethod("jio_get", "jio_get")
    .declareAcquiredMethod("jio_repair", "jio_repair")

    /////////////////////////////////////////////////////////////////
    // published methods
    /////////////////////////////////////////////////////////////////
    .allowPublicAcquisition('notifyDataChannelClosed', function (argument_list, scope) {
      var gadget = this;
      return dropSubGadget(this, scope)
        .push(function () {
          return updateInfo(gadget);
        });
    })

    .allowPublicAcquisition("notifyDataChannelMessage", function (argument_list, scope) {
      var json = JSON.parse(argument_list[0]),
        rtc_gadget,
        context = this;
      return context.getDeclaredGadget(scope)
        .push(function (gadget) {
          rtc_gadget = gadget;
          // Call jio API
          return context["jio_" + json.method_name].apply(context, json.argument_list);
        })
        .push(function (result) {
          return sendWebRTC(context, rtc_gadget, scope, JSON.stringify({
            id: json.id,
            result: result,
            type: "jio_response"
          }));
        }, function (error) {
          return sendWebRTC(context, rtc_gadget, scope, JSON.stringify({
            id: json.id,
            result: error,
            type: "error"
          }));
        });
    })

    .allowPublicAcquisition("notifyWebSocketMessage", function (argument_list) {
      var gadget = this,
        dict = gadget.state_parameter_dict,
        json = JSON.parse(argument_list[0]),
        scope,
        rtc_gadget,
        element;

      if (json.action !== "offer") {
        return;
      }

      // https://github.com/diafygi/webrtc-ips
      dict.connecting = true;
      dict.counter += 1;
      element = document.createElement("div");
      dict.channel_list.appendChild(element);
      scope = "web_rtc" + dict.counter;
      
      // try to connect
      return gadget.declareGadget("gadget_webrtc_datachannel.html", {
        scope: scope,
        element: element
      })
      .push(function (rtc_gadget) {
        var ip_list = [],
          ip_dict = {},
          ip_addr,
          line_list = JSON.parse(json.data).sdp.split('\n'),
          i;
        for (i = 0; i < line_list.length; i += 1) {
          if (line_list[i].indexOf('a=candidate:') === 0) {
            ip_addr = IP_REGEX.exec(line_list[i])[1];
            if (!ip_addr.match(/^[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7}$/)) {
              // Hide ipv6
              if (!ip_dict[ip_addr]) {
                ip_list.push(ip_addr);
                ip_dict[ip_addr] = true;
              }
            }
          }
        }
        dict.scope_ip[scope] = ip_list;
        return rtc_gadget.createAnswer(json.from, json.data);
      })
      .push(function (local_connection) {
        // here I play sound!
        return RSVP.any([
          rtc_gadget.waitForConnection(),
          new RSVP.Queue()
            .push(function () {
              return RSVP.delay(10000);
            })
            .push(function () {
              return dropSubGadget(gadget, scope);
            })
        ]);
      })
      .push(function () {
        gadget.state_parameter_dict.connecting = false;
        return updateInfo(gadget);
      });
      

    });

}(window, rJS, document, RSVP, console, DOMException, JSON));
