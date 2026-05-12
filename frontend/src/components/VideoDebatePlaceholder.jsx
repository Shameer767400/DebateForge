import React, { useRef, useEffect, useState } from 'react';
import { useApi } from '../context/AuthContext';

/**
 * Scaffolding for Day 4 Future Scope: WebRTC Video Integration.
 * Implements local media stream handling and peer connection setup.
 */
const VideoDebatePlaceholder = ({ socket, targetUserId }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [streamEnabled, setStreamEnabled] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Handle incoming WebRTC signals
    socket.on('webrtc_offer_received', async ({ senderId, sdp }) => {
      if (!peerConnectionRef.current) initializePeerConnection();
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit('webrtc_answer', { targetUserId: senderId, sdp: answer });
    });

    socket.on('webrtc_answer_received', async ({ sdp }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    socket.on('webrtc_ice_candidate_received', async ({ candidate }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.off('webrtc_offer_received');
      socket.off('webrtc_answer_received');
      socket.off('webrtc_ice_candidate_received');
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [socket, targetUserId]);

  const initializePeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', { targetUserId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      if (!peerConnectionRef.current) initializePeerConnection();
      
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      
      setStreamEnabled(true);
      socket.emit('webrtc_stream_state_changed', { videoEnabled: true, audioEnabled: true });
    } catch (err) {
      console.error("Error accessing media devices.", err);
    }
  };

  return (
    <div className="video-debate-container p-4 bg-gray-900 rounded-lg shadow-lg">
      <h3 className="text-xl font-bold text-white mb-4">P2P Debate Video (Beta)</h3>
      <div className="flex gap-4">
        <div className="w-1/2">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full bg-black rounded" />
          <p className="text-gray-400 mt-2 text-center">Local Stream</p>
        </div>
        <div className="w-1/2">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full bg-black rounded" />
          <p className="text-gray-400 mt-2 text-center">Opponent Stream</p>
        </div>
      </div>
      {!streamEnabled && (
        <button onClick={startLocalStream} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded">
          Enable Camera & Mic
        </button>
      )}
    </div>
  );
};

export default VideoDebatePlaceholder;
