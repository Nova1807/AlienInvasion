import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { WS_URL } from '@/constants/config';
import type {
  ErrorPayload,
  GameState,
  Phase,
  Role,
  RoomJoinedPayload,
  RoomUpdatePayload,
} from '@/types/game';

const createInitialState = (): GameState => ({
  connected: false,
  phase: 'lobby',
  players: [],
  publicChat: [],
  werewolfChat: [],
  werewolfVotes: [],
  dayVotes: [],
});

interface GameContextValue {
  state: GameState;
  lastError: string | null;
  connectAsHost(hostName: string): Promise<RoomJoinedPayload>;
  joinGame(roomCode: string, name: string): Promise<RoomJoinedPayload>;
  disconnect(): void;
  sendPublicMessage(text: string): void;
  sendWerewolfMessage(text: string): void;
  setRole(playerId: string, role: Role): void;
  setAlive(playerId: string, alive: boolean): void;
  setPhase(phase: Phase): void;
  clearVotes(scope: 'werewolf' | 'day'): void;
  castWerewolfVote(targetId: string): void;
  castDayVote(targetId: string): void;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export const GameProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<GameState>(createInitialState);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingJoinRef = useRef<{
    resolve: (payload: RoomJoinedPayload) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const resetState = useCallback(() => {
    setState(createInitialState());
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    socketRef.current = null;
  }, []);

  const handleRoomJoined = useCallback((payload: RoomJoinedPayload) => {
    setState((prev) => ({
      ...prev,
      connected: true,
      roomCode: payload.roomCode,
      playerId: payload.playerId,
    }));
    if (pendingJoinRef.current) {
      pendingJoinRef.current.resolve(payload);
      pendingJoinRef.current = null;
    }
  }, []);

  const handleRoomUpdate = useCallback((payload: RoomUpdatePayload) => {
    setLastError(null);
    setState((prev) => ({
      connected: true,
      roomCode: payload.roomCode,
      phase: payload.phase,
      players: payload.players,
      self: payload.self,
      publicChat: payload.publicChat,
      werewolfChat: payload.werewolfChat ?? [],
      werewolfVotes: payload.werewolfVotes ?? [],
      dayVotes: payload.dayVotes ?? [],
      playerId: payload.self?.id ?? prev.playerId,
    }));
  }, []);

  const handleError = useCallback((payload: ErrorPayload) => {
    const message = payload.message || 'Unbekannter Fehler.';
    setLastError(message);
    if (pendingJoinRef.current) {
      pendingJoinRef.current.reject(new Error(message));
      pendingJoinRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    closeSocket();
    resetState();
    if (pendingJoinRef.current) {
      pendingJoinRef.current.reject(new Error('Verbindung wurde geschlossen.'));
      pendingJoinRef.current = null;
    }
  }, [closeSocket, resetState]);

  const connect = useCallback(
    (type: 'create_room' | 'join_room', payload: Record<string, unknown>) => {
      closeSocket();
      resetState();
      setLastError(null);

      return new Promise<RoomJoinedPayload>((resolve, reject) => {
        try {
          const socket = new WebSocket(WS_URL);
          socketRef.current = socket;
          pendingJoinRef.current = { resolve, reject };

          socket.onopen = () => {
            socket.send(JSON.stringify({ type, payload }));
          };

          socket.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data as string);
              switch (message.type) {
                case 'room_joined':
                  handleRoomJoined(message.payload as RoomJoinedPayload);
                  break;
                case 'room_update':
                  handleRoomUpdate(message.payload as RoomUpdatePayload);
                  break;
                case 'error':
                  handleError(message.payload as ErrorPayload);
                  break;
                case 'room_closed':
                  setLastError((message.payload?.reason as string) || 'Der Host hat das Spiel beendet.');
                  handleClose();
                  break;
                default:
                  break;
              }
            } catch (error) {
              console.error('Konnte Nachricht nicht verarbeiten', error);
            }
          };

          socket.onerror = () => {
            const error = new Error('Die Verbindung konnte nicht aufgebaut werden.');
            setLastError(error.message);
            if (pendingJoinRef.current) {
              pendingJoinRef.current.reject(error);
              pendingJoinRef.current = null;
            }
          };

          socket.onclose = () => {
            handleClose();
          };
        } catch (error) {
          reject(error as Error);
        }
      });
    },
    [closeSocket, handleClose, handleError, handleRoomJoined, handleRoomUpdate, resetState],
  );

  const ensureConnection = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Keine aktive Verbindung zum Host-Server.');
    }
    return socket;
  }, []);

  const sendMessage = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      try {
        const socket = ensureConnection();
        socket.send(JSON.stringify({ type, payload }));
      } catch (error) {
        setLastError((error as Error).message);
      }
    },
    [ensureConnection],
  );

  const connectAsHost = useCallback(
    (hostName: string) => connect('create_room', { hostName: hostName.trim() }),
    [connect],
  );

  const joinGame = useCallback(
    (roomCode: string, name: string) =>
      connect('join_room', { roomCode: roomCode.trim().toUpperCase(), name: name.trim() }),
    [connect],
  );

  const disconnect = useCallback(() => {
    closeSocket();
    resetState();
    setLastError(null);
  }, [closeSocket, resetState]);

  const sendPublicMessage = useCallback(
    (text: string) => sendMessage('public_chat', { text }),
    [sendMessage],
  );

  const sendWerewolfMessage = useCallback(
    (text: string) => sendMessage('werewolf_chat', { text }),
    [sendMessage],
  );

  const setRole = useCallback(
    (playerId: string, role: Role) => sendMessage('set_role', { playerId, role }),
    [sendMessage],
  );

  const setAlive = useCallback(
    (playerId: string, alive: boolean) => sendMessage('set_alive', { playerId, alive }),
    [sendMessage],
  );

  const setPhase = useCallback(
    (phase: Phase) => sendMessage('set_phase', { phase }),
    [sendMessage],
  );

  const clearVotes = useCallback(
    (scope: 'werewolf' | 'day') => sendMessage('clear_votes', { scope }),
    [sendMessage],
  );

  const castWerewolfVote = useCallback(
    (targetId: string) => sendMessage('werewolf_vote', { targetId }),
    [sendMessage],
  );

  const castDayVote = useCallback(
    (targetId: string) => sendMessage('day_vote', { targetId }),
    [sendMessage],
  );

  const value = useMemo(
    () => ({
      state,
      lastError,
      connectAsHost,
      joinGame,
      disconnect,
      sendPublicMessage,
      sendWerewolfMessage,
      setRole,
      setAlive,
      setPhase,
      clearVotes,
      castWerewolfVote,
      castDayVote,
    }),
    [
      state,
      lastError,
      connectAsHost,
      joinGame,
      disconnect,
      sendPublicMessage,
      sendWerewolfMessage,
      setRole,
      setAlive,
      setPhase,
      clearVotes,
      castWerewolfVote,
      castDayVote,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame muss innerhalb eines GameProvider verwendet werden.');
  }
  return context;
}
