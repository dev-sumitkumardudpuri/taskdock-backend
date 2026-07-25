import express from "express";
import {
  getBoardTasks,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getActivityLogs,
} from "../controllers/taskController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { checkWorkspaceRole } from "../middlewares/rbacMiddleware.js";

const router = express.Router();

router.get("/board/:boardId", protect, getBoardTasks);

router.post("/", protect, checkWorkspaceRole(["admin", "member"]), createTask);

router.put(
  "/:taskId",
  protect,
  checkWorkspaceRole(["admin", "member"]),
  updateTask,
);

router.patch(
  "/:taskId/move",
  protect,
  checkWorkspaceRole(["admin", "member"]),
  moveTask,
);

router.delete(
  "/:taskId",
  protect,
  checkWorkspaceRole(["admin", "member"]),
  deleteTask,
);

router.get(
  "/activity/:workspaceId",
  protect,
  checkWorkspaceRole(["admin", "member", "viewer"]),
  getActivityLogs,
);

export default router;
