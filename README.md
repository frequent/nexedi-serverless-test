### WebSocket-BroadCaster example 
#### Serverless WebRTC over LAN

The example shows how to setup WebRTC using a Websocket Server Chrome Browser Extension on a LAN. 

For details, refer to this [blog article about serverless WebRTC](http://www.nexedi.com/blog/NXD-Document.Blog.Serverless.WebRTC.Database.Using.Chrome.Http.Web.Socket.Server)

Steps:

- Run our Websocket Broadcaster Extension ([Chrome Web Store](https://chrome.google.com/webstore/detail/websocket-message-broadca/cflgkkmbfpmbhijklfimcflfomoplehj?hl=en&gl=FR)/[Gitlab](https://lab.nexedi.com/nexedi/WebSocket-BroadCaster))
- Open [slave.html](http://frequent.github.io/nexedi-serverless-test/slave.html) and [master.html](http://frequent.github.io/nexedi-serverless-test/master.html) in two different tabs (if trying on the same machine) or on two decives connected over the same LAN (master.html and broadcaster have to be run on the same device)
- On the slave page *Request WebRTC Connection over WebSocket*, enter the Broadcasters WebSocket address displayed under *Server Url*. This will initiate the exchange of WebRTC offers over WebSocket. The status message will inform you once a connection is set. Your master node should then also display the peer connected over WebRTC.
- Create sample records on the slave, which will be posted to and stored on the master. Check indexedDB contents on the Developer Tool's Source Tab. Your records should be there.
- Try to query records. Queries will also be sent over WebRTC to the master which runs the query on indexedDB and returns the answer over WebRTC again.
- You can see over the network tab that no requests are being triggered.
