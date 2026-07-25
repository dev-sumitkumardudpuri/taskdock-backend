import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    try {
      let token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      // Extract token from cookies if not present in handshake headers/auth
      if (!token && socket.handshake.headers.cookie) {
        const parsedCookies = cookie.parse(socket.handshake.headers.cookie);
        token = parsedCookies.jwt || parsedCookies.token;
      }

      if (!token) {
        return next(
          new Error("Socket authentication failed: No token provided"),
        );
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(
        new Error("Socket authentication failed: Invalid or expired token"),
      );
    }
  });

  // Event Listeners
  io.on("connection", (socket) => {
    const userId = socket.user?.id || socket.user?.userId || socket.user?._id;
    console.log(`User connected to Socket: ${userId}`);

    // Automatically join personal user room for targeted notifications
    if (userId) {
      socket.join(`user_${userId}`);
    }

    // Join specific Board Room
    socket.on("JOIN_BOARD", ({ boardId }) => {
      if (!boardId) return;
      const room = `board_${boardId}`;
      socket.join(room);
      console.log(`User ${userId} joined board room: ${room}`);
    });

    // Leave specific Board Room
    socket.on("LEAVE_BOARD", ({ boardId }) => {
      if (!boardId) return;
      const room = `board_${boardId}`;
      socket.leave(room);
      console.log(`User ${userId} left board room: ${room}`);
    });

    // Join specific Workspace Room
    socket.on("JOIN_WORKSPACE", ({ workspaceId }) => {
      if (!workspaceId) return;
      const room = `workspace_${workspaceId}`;
      socket.join(room);
      console.log(`User ${userId} joined workspace room: ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userId}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};
