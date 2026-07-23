/**
 * useConnectionHealth — a real connection-health signal for the game screens.
 *
 * A browser can't expose wifi signal strength, but it CAN tell you the thing
 * that actually matters here: is the realtime socket the game runs on healthy?
 * This measures three real things and rolls them into one status:
 *   • realtime socket state (SUBSCRIBED vs erroring/reconnecting)
 *   • round-trip ping — a broadcast echoed back through the server (self:true)
 *   • navigator.onLine (web offline flag)
 *
 * So a player who gets disconnected can glance at the pill: 🔴 Reconnecting =
 * their network; still 🟢 but forfeited = a bug worth reporting.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type ConnStatus = 'good' | 'weak' | 'reconnecting' | 'offline';
export interface ConnHealth { status: ConnStatus; pingMs: number | null; }

const PING_INTERVAL = 4000;  // how often we ping
const PONG_TIMEOUT = 9000;   // no echo for this long → reconnecting
const WEAK_MS = 700;         // round-trip slower than this → weak

export function useConnectionHealth(): ConnHealth {
  const [status, setStatus] = useState<ConnStatus>('good');
  const [pingMs, setPingMs] = useState<number | null>(null);

  const subscribedRef = useRef(false);
  const lastPongRef = useRef(0);
  const rttRef = useRef<number | null>(null);

  useEffect(() => {
    lastPongRef.current = Date.now();
    const ch = supabase.channel(`conn_health_${Math.random().toString(36).slice(2)}`, {
      config: { broadcast: { self: true } },  // echo our own ping back through the server
    });

    ch.on('broadcast', { event: 'ping' }, ({ payload }) => {
      const rtt = Date.now() - payload.t;
      rttRef.current = rtt;
      lastPongRef.current = Date.now();
      setPingMs(rtt);
    });
    ch.subscribe((s) => { subscribedRef.current = s === 'SUBSCRIBED'; });

    const sendPing = () => {
      if (!subscribedRef.current) return;
      ch.send({ type: 'broadcast', event: 'ping', payload: { t: Date.now() } });
    };

    const evaluate = () => {
      const online = Platform.OS !== 'web' || typeof navigator === 'undefined' || navigator.onLine;
      if (!online) { setStatus('offline'); return; }
      const sincePong = Date.now() - lastPongRef.current;
      if (!subscribedRef.current || sincePong > PONG_TIMEOUT) { setStatus('reconnecting'); return; }
      if ((rttRef.current ?? 0) > WEAK_MS || sincePong > PING_INTERVAL * 2) { setStatus('weak'); return; }
      setStatus('good');
    };

    // Ping first, then on a steady cadence evaluate + ping again.
    sendPing();
    const timer = setInterval(() => { evaluate(); sendPing(); }, PING_INTERVAL);

    return () => { clearInterval(timer); void supabase.removeChannel(ch); };
  }, []);

  return { status, pingMs };
}
