import express from "express";
import {
  getMyWorkspaces,
  createWorkspace,
  getWorkspaceBoards,
  createBoard,
  switchWorkspace,
  updateWorkspace,
} from "../controllers/workspaceController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { checkWorkspaceRole } from "../middlewares/rbacMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyWorkspaces);
router.post("/", protect, createWorkspace);
router.post("/switch", protect, switchWorkspace);

router.get(
  "/:workspaceId/boards",
  protect,
  checkWorkspaceRole(["admin", "member", "viewer"]),
  getWorkspaceBoards,
);

router.post(
  "/boards",
  protect,
  checkWorkspaceRole(["admin", "member"]),
  createBoard,
);

router.put(
  "/:workspaceId",
  protect,
  checkWorkspaceRole(["admin"]),
  updateWorkspace,
);

export default router;
