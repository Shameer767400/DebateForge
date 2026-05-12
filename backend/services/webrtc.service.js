'use strict';

/**
 * @fileoverview WebRTC and P2P Video Debate Service (Future Scope Scaffold)
 *
 * This module establishes the structural foundation for the "Video debates"
 * and "Peer-to-peer debates" features outlined in the ROADMAP.md (v1.2 & v1.3).
 *
 * NOTE: As per the current project specification, real-time multiplayer video
 * debates are EXPLICITLY OUT OF SCOPE for the current release. This service
 * provides the architectural interface to safely onboard these features in the
 * future without requiring significant Day 4 rework, while remaining completely
 * decoupled from the V1 core WebSocket loop.
 *
 * Future Responsibilities:
 *   - RTCPeerConnection signaling state management
 *   - ICE candidate exchange and TURN/STUN relay negotiation
 *   - MediaStream capability checks
 *   - WebRTC session cleanup on disconnect
 *
 * @module services/webrtc.service
 */

/**
 * Process a WebRTC signaling event (Future Scope)
 *
 * @param {Object} io - The Socket.IO server instance
 * @param {Object} socket - The connected client socket
 * @param {Object} payload - The WebRTC signaling payload (offer, answer, or ICE candidate)
 */
async function handleSignalingEvent(io, socket, payload) {
  // Scaffold: Validate payload schema
  if (!payload || !payload.targetUserId) {
    throw new Error('Invalid signaling payload');
  }

  // Scaffold: Enforce that this is out-of-scope for V1 to prevent accidental usage
  if (process.env.NODE_ENV !== 'development_p2p') {
    socket.emit('error', { error: 'P2P Video debates are currently in development (Future Scope).' });
    return;
  }

  const { type, targetUserId } = payload;
  
  if (type === 'offer') {
    // Relay offer to target
    io.to(targetUserId).emit('webrtc_offer', {
      offer: payload.sdp,
      senderId: socket.user.id,
    });
  } else if (type === 'answer') {
    // Relay answer to initiator
    io.to(targetUserId).emit('webrtc_answer', {
      answer: payload.sdp,
      senderId: socket.user.id,
    });
  } else if (type === 'ice_candidate') {
    // Relay ICE candidate
    io.to(targetUserId).emit('webrtc_ice_candidate', {
      candidate: payload.candidate,
      senderId: socket.user.id,
    });
  }
}

/**
 * Request TURN server credentials for symmetric NAT traversal (Future Scope)
 *
 * @returns {Promise<Object>} ICE server configuration
 */
async function getTurnCredentials() {
  // Scaffold: Return mock credentials
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Future: add dynamically generated TURN credentials via Twilio/Metered
    ],
  };
}

module.exports = {
  handleSignalingEvent,
  getTurnCredentials,
};
