import Task from "../models/task.js";
import ActivityLog from "../models/activitylog.js";
import { getIO } from "../socket.js";

const emitSocketEvent = (boardId, workspaceId, eventName, payload) => {
  try {
    const io = getIO();
    if (io) {
      if (boardId) {
        io.to(`board_${boardId}`).emit(eventName, payload);
      }
      if (workspaceId) {
        io.to(`workspace_${workspaceId}`).emit(eventName, payload);
      }
    }
  } catch (err) {
    console.log("Socket emit skipped or not ready:", err.message);
  }
};

// GET ALL TASKS FOR A BOARD
export const getBoardTasks = async (req, res) => {
  try {
    const { boardId } = req.params;
    const tasks = await Task.find({ boardId })
      .populate("assignedTo", "name email avatar")
      .sort({ position: 1 });

    res.status(200).json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CREATE A TASK
export const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      boardId,
      workspaceId,
      columnName,
      priority,
      dueDate,
    } = req.body;

    if (!title || !boardId || !workspaceId) {
      return res.status(400).json({
        success: false,
        message: "Title, boardId, and workspaceId are required",
      });
    }

    const userId = req.user._id || req.user.id;
    const colName = columnName || "To Do";

    const taskCount = await Task.countDocuments({
      boardId,
      columnName: colName,
    });

    const newTask = await Task.create({
      title,
      description: description || "",
      workspaceId,
      boardId,
      columnName: colName,
      priority: priority || "Medium",
      dueDate: dueDate || null,
      position: taskCount,
      assignedTo: [userId],
      createdBy: userId,
    });

    const populatedTask = await Task.findById(newTask._id).populate(
      "assignedTo",
      "name email avatar",
    );

    // Create Activity Log
    const newLog = await ActivityLog.create({
      workspaceId,
      boardId,
      performedBy: userId,
      action: `Created task "${title}" in ${colName}`,
      entityType: "Task",
      entityId: newTask._id,
      details: { taskTitle: title, columnName: colName },
    });

    const populatedLog = await ActivityLog.findById(newLog._id).populate(
      "performedBy",
      "name email avatar",
    );

    emitSocketEvent(boardId, workspaceId, "TASK_CREATED", populatedTask);
    emitSocketEvent(boardId, workspaceId, "NEW_ACTIVITY_LOG", populatedLog);

    res.status(201).json({ success: true, task: populatedTask });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE TASK DETAILS
export const updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { columnName, title, workspaceId } = req.body;
    const userId = req.user._id || req.user.id;

    const oldTask = await Task.findById(taskId);
    if (!oldTask) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { ...req.body },
      { new: true },
    ).populate("assignedTo", "name email avatar");

    const targetWorkspaceId =
      workspaceId || updatedTask.workspaceId || oldTask.workspaceId;

    let actionMessage = `Updated task "${updatedTask.title}"`;

    if (columnName && oldTask.columnName !== columnName) {
      actionMessage = `Moved task "${updatedTask.title}" from ${oldTask.columnName} to ${columnName}`;
    }

    const newLog = await ActivityLog.create({
      workspaceId: targetWorkspaceId,
      boardId: updatedTask.boardId,
      performedBy: userId,
      action: actionMessage,
      entityType: "Task",
      entityId: updatedTask._id,
      details: {
        taskTitle: updatedTask.title,
        from: oldTask.columnName,
        to: columnName || oldTask.columnName,
      },
    });

    const populatedLog = await ActivityLog.findById(newLog._id).populate(
      "performedBy",
      "name email avatar",
    );

    if (columnName && oldTask.columnName !== columnName) {
      emitSocketEvent(updatedTask.boardId, targetWorkspaceId, "TASK_MOVED", {
        taskId,
        newColumnName: columnName,
        task: updatedTask,
      });
    } else {
      emitSocketEvent(
        updatedTask.boardId,
        targetWorkspaceId,
        "TASK_UPDATED",
        updatedTask,
      );
    }

    emitSocketEvent(
      updatedTask.boardId,
      targetWorkspaceId,
      "NEW_ACTIVITY_LOG",
      populatedLog,
    );

    res.status(200).json({ success: true, task: updatedTask });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// MOVE TASK (DRAG & DROP POSITIONING ENGINE)
export const moveTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { newColumnName, newPosition, workspaceId } = req.body;
    const userId = req.user._id || req.user.id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const oldColumn = task.columnName;
    const oldPosition = task.position;
    const boardId = task.boardId;
    const targetPosition =
      typeof newPosition === "number" ? newPosition : oldPosition;

    if (oldColumn === newColumnName) {
      if (oldPosition !== targetPosition) {
        if (targetPosition > oldPosition) {
          await Task.updateMany(
            {
              boardId,
              columnName: oldColumn,
              position: { $gt: oldPosition, $lte: targetPosition },
            },
            { $inc: { position: -1 } },
          );
        } else {
          await Task.updateMany(
            {
              boardId,
              columnName: oldColumn,
              position: { $gte: targetPosition, $lt: oldPosition },
            },
            { $inc: { position: 1 } },
          );
        }
      }
    } else {
      await Task.updateMany(
        { boardId, columnName: oldColumn, position: { $gt: oldPosition } },
        { $inc: { position: -1 } },
      );

      await Task.updateMany(
        {
          boardId,
          columnName: newColumnName,
          position: { $gte: targetPosition },
        },
        { $inc: { position: 1 } },
      );
    }

    task.columnName = newColumnName || task.columnName;
    task.position = targetPosition;
    await task.save();

    const populatedTask = await Task.findById(task._id).populate(
      "assignedTo",
      "name email avatar",
    );

    const targetWorkspaceId = workspaceId || task.workspaceId;
    const newLog = await ActivityLog.create({
      workspaceId: targetWorkspaceId,
      boardId,
      performedBy: userId,
      action: `Moved task "${task.title}" from ${oldColumn} to ${task.columnName}`,
      entityType: "Task",
      entityId: task._id,
      details: {
        taskTitle: task.title,
        from: oldColumn,
        to: task.columnName,
      },
    });

    const populatedLog = await ActivityLog.findById(newLog._id).populate(
      "performedBy",
      "name email avatar",
    );

    emitSocketEvent(boardId, targetWorkspaceId, "TASK_MOVED", {
      taskId: task._id,
      oldColumn,
      newColumnName: task.columnName,
      newPosition: targetPosition,
      task: populatedTask,
      movedBy: userId,
    });
    emitSocketEvent(
      boardId,
      targetWorkspaceId,
      "NEW_ACTIVITY_LOG",
      populatedLog,
    );

    res.status(200).json({ success: true, task: populatedTask });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE TASK
export const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user._id || req.user.id;
    const task = await Task.findById(taskId);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    await Task.deleteOne({ _id: taskId });
    await Task.updateMany(
      {
        boardId: task.boardId,
        columnName: task.columnName,
        position: { $gt: task.position },
      },
      { $inc: { position: -1 } },
    );

    const newLog = await ActivityLog.create({
      workspaceId: task.workspaceId,
      boardId: task.boardId,
      performedBy: userId,
      action: `Deleted task "${task.title}"`,
      entityType: "Task",
      entityId: task._id,
      details: { taskTitle: task.title },
    });

    const populatedLog = await ActivityLog.findById(newLog._id).populate(
      "performedBy",
      "name email avatar",
    );

    emitSocketEvent(task.boardId, task.workspaceId, "TASK_DELETED", {
      taskId: task._id,
    });
    emitSocketEvent(
      task.boardId,
      task.workspaceId,
      "NEW_ACTIVITY_LOG",
      populatedLog,
    );

    res
      .status(200)
      .json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET ACTIVITY LOGS
export const getActivityLogs = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const logs = await ActivityLog.find({ workspaceId })
      .populate("performedBy", "name email avatar")
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
