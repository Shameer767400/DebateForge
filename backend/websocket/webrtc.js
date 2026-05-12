/**
 * @fileoverview WebRTC Signaling Server Scaffolding for P2P Debate Mode.
 *
 * Implements the Day 4 Future Scope enhancement: WebRTC video integration.
 * Provides signaling for peer connections (offer, answer, ICE candidates).
 *
 * @module websocket/webrtc
 */

'use strict';

function registerWebRTCHandlers(io, socket) {
  // Handle signaling for WebRTC peer connection
  socket.on('webrtc_offer', (data) => {
    const { targetUserId, sdp } = data;
    // Route the offer to the specific peer
    socket.to(targetUserId).emit('webrtc_offer_received', {
      senderId: socket.user.id,
      sdp,
    });
  });

  socket.on('webrtc_answer', (data) => {
    const { targetUserId, sdp } = data;
    // Route the answer back to the original caller
    socket.to(targetUserId).emit('webrtc_answer_received', {
      senderId: socket.user.id,
      sdp,
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { targetUserId, candidate } = data;
    // Route ICE candidate to the peer
    socket.to(targetUserId).emit('webrtc_ice_candidate_received', {
      senderId: socket.user.id,
      candidate,
    });
  });

  socket.on('webrtc_stream_state_changed', (data) => {
    const { roomId, videoEnabled, audioEnabled } = data;
    // Notify the room about media state changes
    socket.to(roomId).emit('peer_stream_state', {
      userId: socket.user.id,
      videoEnabled,
      audioEnabled,
    });
  });
}

module.exports = {
  registerWebRTCHandlers,
};
