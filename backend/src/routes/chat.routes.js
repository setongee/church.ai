import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as c from '../controllers/chat.controller.js';
import * as call from '../controllers/call.controller.js';
import { sendVoice, voiceUpload } from '../controllers/voice.controller.js';

const router = Router();

router.get('/rooms', h(c.listRooms));
router.get('/unread', h(c.unreadSummary));
router.get('/reactions', h(c.reactionList));
router.post('/rooms/:id/join', h(c.joinRoom));
router.post('/rooms/:id/leave', h(c.leaveRoom));
router.post('/rooms/:id/read', h(c.markRead));
router.get('/rooms/:id/members', h(c.roomMembers));
router.get('/rooms/:id/messages', h(c.listMessages));
router.post('/rooms/:id/messages', h(c.sendMessage));
router.post('/rooms/:id/voice', voiceUpload, h(sendVoice));
// Group calls: admins start them; members request one and an admin approves or declines.
router.get('/ice-servers', h(call.iceServersFor));
router.get('/calls', h(call.myLiveCalls));
router.get('/rooms/:id/call', h(call.roomCall));
router.post('/rooms/:id/call', h(call.startRoomCall));
router.post('/rooms/:id/call/ping', h(call.pingCall));
router.get('/rooms/:id/scheduled-calls', h(call.listScheduledCalls));
router.post('/rooms/:id/scheduled-calls', h(call.scheduleCall));
router.delete('/scheduled-calls/:id', h(call.cancelScheduledCall));
router.post('/rooms/:id/call-requests', h(call.requestCall));
router.post('/call-requests/:id/approve', h(call.approveCall));
router.post('/call-requests/:id/decline', h(call.declineCall));
router.post('/call-requests/:id/cancel', h(call.cancelCallRequest));
router.post('/messages/:id/reactions', h(c.toggleReaction));
router.patch('/messages/:id', h(c.editMessage));
router.delete('/messages/:id', h(c.deleteMessage));

export default router;
