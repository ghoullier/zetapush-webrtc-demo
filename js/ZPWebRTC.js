/*
  WebRTC with ZetaPush

  Mikael Morvan dec 2015

  A zp object must be initialized first !
  */

var zpWebRTC = (function() {
  var zpMessagingSrvc= new zp.service.Generic('SKRP');

  // Manage peers
  var peers={};

  var iceConfig = { 'iceServers': [
      { 'url': 'stun:stun.l.google.com:19302' },
      { 'url': 'stun:stun1.l.google.com:19302' },
      { 'url': 'stun:stun2.l.google.com:19302' },
      { 'url': 'stun:stun3.l.google.com:19302' },
      { 'url': 'stun:stun4.l.google.com:19302' },
      { 'url': 'stun:stun01.sipphone.com' },
      { 'url': 'stun:stun.ekiga.net' },
      { 'url': 'stun:stun.fwdnet.net' },
      { 'url': 'stun:stun.ideasip.com' },
      { 'url': 'stun:stun.iptel.org' }
    ]},
    //peerConnections = {},
    currentId,
    videoInProgress= false,
    stream;

  var localVideo = document.querySelector('.Video--Local');
  var remoteVideo = document.querySelector('.Video--Remote');
  var localStream;
  var pc1;
  var offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
  };

  localVideo.addEventListener('loadedmetadata', function() {
    trace('Local video videoWidth: ' + this.videoWidth +
      'px,  videoHeight: ' + this.videoHeight + 'px');
  });

  // Get a stream

  function gotStream(stream) {
    trace('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
  }

  function startVideo() {
    trace('Requesting local stream');
    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    })
    .then(gotStream)
    .catch(function(e) {
      alert('getUserMedia() error: ' + e.name);
    });
  }


  function getConnection(userId) {
    console.warn('getConnection', userId, peers)
    if (peers[userId]){
      return peers[userId].connection;
    }
  }

  function addPeerConnection(userId, connection){
    if (!peers[userId]){
      peers[userId]={};
    }
    peers[userId].connection= connection;
  }

  function addPeerStream(userId, stream){
    if (!peers[userId]){
      peers[userId]={};
    }
    peers[userId].url= URL.createObjectURL(stream);
    peers[userId].stream= stream;
    remoteVideo.srcObject = stream;
  }

  function removePeer(userId){
    if (peers[userId]){
      delete peers[userId];
      return true;
    } else {
      return false;
    }
  }

  function getPeerConnection(userId) {
    if (getConnection(userId)) {
      return getConnection(userId);
    }
    var pc = new RTCPeerConnection(iceConfig);
    pc.userId= userId;
    addPeerConnection(userId, pc);
    pc.addStream(localStream);
    pc.onicecandidate = function (evt) {
      console.log('onicecandidate', evt);
      var msg={
        context: 'webRTC',
        verb: 'ice',
        ice: evt.candidate
      }
      var params= {
        target: userId,
        data: msg
      }
      zpMessagingSrvc.send('send', params);
    };
    pc.oniceconnectionstatechange= function(evt){
      console.log('oniceconnectionstatechange', evt);
      if (evt.target.iceConnectionState === 'connected' || evt.target.iceConnectionState === 'completed'){
        videoInProgress= true;
      }
      if (evt.target.iceConnectionState === 'closed' || evt.target.iceConnectionState === 'disconnected'){
        removePeer(evt.target.userId);
        videoInProgress= false;
      }
    };

    pc.onaddstream = function (evt) {
      console.log('Received new stream', evt);
      addPeerStream(userId, evt.stream);
    };
    return pc;
  }

  zpMessagingSrvc.on('reply', function(msg){
    console.log("onMessage", msg);
    if (msg.data.data.context != 'webRTC')
      return;

    var pc;

    switch (msg.data.data.verb) {
      case 'hangup':
      removePeer(msg.data.source);
      //$rootScope.$broadcast('HANGUP', msg.data.source);
      break;
      case 'sdp-offer':
      pc= getPeerConnection(msg.data.source);
      pc.setRemoteDescription(new RTCSessionDescription(msg.data.data.sdp), function () {
        console.log('Setting remote description by offer');
        pc.createAnswer(function (sdp) {
          pc.setLocalDescription(sdp);
          var newMsg={
            context: 'webRTC',
            verb: 'sdp-answer',
            sdp: sdp
          }
          var params= {
            target: msg.data.source,
            data: newMsg
          }
          zpMessagingSrvc.send('send', params);
        });
      });
      break;
      case 'sdp-answer':
      pc= getPeerConnection(msg.data.source);
      pc.setRemoteDescription(new RTCSessionDescription(msg.data.data.sdp), function () {
        console.log('Setting remote description by answer');
      }, function (e) {
        console.error(e);
      });
      break;
      case 'ice':
      pc= getPeerConnection(msg.data.source);
      if (msg.data.data.ice) {
        console.log('Adding ice candidates');
        pc.addIceCandidate(new RTCIceCandidate(msg.data.data.ice));
      }
      break;
    }
  })

  function makeOffer(userId) {
    var pc = getPeerConnection(userId);
    pc.createOffer(function (sdp) {
      pc.setLocalDescription(sdp);
      console.log('Creating an offer for', userId);
      var msg={
        context: 'webRTC',
        verb: 'sdp-offer',
        sdp: sdp
      }
      var params= {
        target: userId,
        data: msg
      }
      zpMessagingSrvc.send('send', params);
    }, function (e) {
      console.log(e);
    },
    { mandatory: { OfferToReceiveVideo: true, OfferToReceiveAudio: true }});
  }

  function hangup(){
    console.log('hangup');
    for (var key in peers) {
      peers[key].connection.close();
      var msg={
        context: 'webRTC',
        verb: 'hangup'
      }
      var params= {
        target: key,
        data: msg
      }
      zpMessagingSrvc.send('send', params);
    };

  }
  return {
    makeOffer: makeOffer,
    hangup: hangup,
    startVideo: startVideo
  };
})();
