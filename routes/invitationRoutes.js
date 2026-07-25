import express from "express";
import {
  sendInvitation,
  getPendingInvitations,
  respondToInvitation,
} from "../controllers/workspaceController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/send", protect, sendInvitation);

router.get("/my-requests", protect, getPendingInvitations);

router.post("/:invitationId/accept", protect, (req, res, next) => {
  req.body.action = "accept";
  respondToInvitation(req, res, next);
});

router.post("/:invitationId/reject", protect, (req, res, next) => {
  req.body.action = "reject";
  respondToInvitation(req, res, next);
});

export default router;
