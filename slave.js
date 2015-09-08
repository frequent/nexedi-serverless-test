/*global window, rJS, document, RSVP */
/*jslint indent: 2, maxerr: 3 */
(function (window, rJS, document, RSVP) {
  "use strict";

  /////////////////////////////////////////////////////////////////
  // Some functions
  /////////////////////////////////////////////////////////////////
  function displayError(gadget, error) {
    // Do not break the application in case of errors.
    // Display it to the user for now, and allow user to go back to the frontpage
    var error_text = "",
      status = gadget.state_parameter_dict.status_message;

    if (error instanceof RSVP.CancellationError) {
      return;
    }

    if (error instanceof XMLHttpRequest) {
      error_text = error.toString() + " " +
        error.status + " " +
        error.statusText;
    } else if (error instanceof Error) {
      error_text = error.toString();
    } else {
      error_text = JSON.stringify(error);
    }

    console.error(error);
    console.error(error.stack);
    status.textContent = "Error: " + error_text; 
  }
  
  function escapeString(my_string) {
    //return my_string.replace(/\"/g, "\\\"");
    return my_string;
  }

  function findList(my_target) {
    var list = my_target.nextSibling;

    while(list && list.nodeType != 1) {
      list = list.nextSibling;
    }
    return list;
  }

  function clearList(my_list) {
    while (my_list.firstChild) {
      my_list.removeChild(my_list.firstChild);
    }
  }

  function queryRecordOverWebrtc(my_gadget, my_event) {
    var target = my_event.target,
      search_string = target.elements.field_search_string.value,
      status = my_gadget.state_parameter_dict.status_message,
      list = findList(target),
      lookup;

    if (search_string) {
      lookup = escapeString(search_string);
      clearList(list);
      return new RSVP.Queue()
        .push(function () {
          status.textContent = "Querying storage...";
          return my_gadget.shared_jio_allDocs({
            "query": 'first:"%' + lookup + '%" OR last:"%' + lookup + '%"',
            //"include_docs": true NOT SUPPORTED ON INDEXEDDB 
          });
        })
        .push(function (my_result) {
          var promise_list = [], 
            i, 
            i_len;
          
          // fetch records one by one
          for (i = 0, i_len = my_result.data.total_rows; i < i_len; i += 1) {
            promise_list.push(
              my_gadget.shared_jio_get(my_result.data.rows[i].id)
            );
          }
          return RSVP.all(promise_list);
        })
        .push(function (my_result_list) {
          var fragment = document.createDocumentFragment(),
            result,
            doc,
            i,
            i_len;

          status.textContent = "";

          for (i = 0, i_len = my_result_list.length; i < i_len; i += 1) {
            doc = my_result_list[i];
            result = document.createElement("li");
            result.textContent = doc.first + " " + doc.last;
            fragment.appendChild(result);
          }
          list.appendChild(fragment);
        });
    }
    status.textContent = "Please enter search string.";
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
    return;
  }

  function initializeWebrtcOverWebsocket(my_gadget, my_event) {
    var target = my_event.target,
      value = target.querySelector(".ops-socket-connector").value,
      status =  my_gadget.state_parameter_dict.status_message;

    if (value) {
      status.textContent = "Try to connect over " + value + " ...";
      return new RSVP.Queue()
        .push(function () {
          return my_gadget.shared_jio_create({"socket_url": value});
        })
        .push(function () {
          status.textContent = "WebRTC active.";
        });
    }
    status.textContent = "Please enter WebSocket Url.";
    return false;
  }

  /////////////////////////////////////////////////////////////////
  // Gadget behaviour
  /////////////////////////////////////////////////////////////////

  rJS(window)
    /////////////////////////////////////////////////////////////////
    // ready
    /////////////////////////////////////////////////////////////////
    .ready(function (gadget) {
      gadget.state_parameter_dict = {};
      return gadget.getElement()
        .push(function (element) {
          gadget.state_parameter_dict.element = element;
          gadget.state_parameter_dict.status_message = 
            element.querySelector(".ops-status");
        });
    })

    /////////////////////////////////////////////////////////////////
    // acquired methods
    /////////////////////////////////////////////////////////////////

    /////////////////////////////////////////////////////////////////
    // published methods
    /////////////////////////////////////////////////////////////////
    .allowPublicAcquisition('reportServiceError', function (param_list, gadget_scope) {
      if (gadget_scope === undefined) {
        // don't fail in case of dropped subgadget (like previous page)
        // only accept errors from header, panel and displayed page
        return;
      }
      return displayError(this, param_list[0]);
    })

    /////////////////////////////////////////////////////////////////
    // declared methods
    /////////////////////////////////////////////////////////////////
    .declareMethod('shared_jio_create', function (my_param_list) {
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return gadget.getDeclaredGadget("access_storage_via_webrtc");
        })
        .push(function (my_gadget) {
          return my_gadget.createJio(my_param_list);  
        });
    })
    .declareMethod("shared_jio_post", function (my_param_dict) {
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return gadget.getDeclaredGadget("access_storage_via_webrtc");
        })
        .push(function (my_gadget) {
          return my_gadget.post(my_param_dict);
        });
    })
    .declareMethod("shared_jio_get", function (my_param_dict) {
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return gadget.getDeclaredGadget("access_storage_via_webrtc");
        })
        .push(function (my_gadget) {
          return my_gadget.get(my_param_dict);
        });
    })
    .declareMethod("shared_jio_allDocs", function (my_param_dict) {
      var gadget = this;
      return new RSVP.Queue()
        .push(function () {
          return gadget.getDeclaredGadget("access_storage_via_webrtc");
        })
        .push(function (my_gadget) {
          return my_gadget.allDocs(my_param_dict);
        });
    })
    
    /////////////////////////////////////////////////////////////////
    // declared services
    /////////////////////////////////////////////////////////////////
    .declareService(function () {
      var gadget = this;

      function handleFormSubmit(my_event) {
        
        switch (my_event.target.className) {
          case "ops-form-initializer":
            return initializeWebrtcOverWebsocket(gadget, my_event);
          case "ops-form-create":
            return createRecordOverWebrtc(gadget, my_event);
          case "ops-form-query":
            return queryRecordOverWebrtc(gadget, my_event);
        }
      }

      // Listen to form submit
      return loopEventListener(
        gadget.state_parameter_dict.element,
        'submit',
        false,
        handleFormSubmit
      );
    });

}(window, rJS, document, RSVP));
