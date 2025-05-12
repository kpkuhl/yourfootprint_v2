'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkConnection() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setIsConnected(true);
      } catch (error) {
        console.error('Error connecting to Supabase:', error);
        setIsConnected(false);
      }
    }

    checkConnection();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">working</h1>
      <div className="text-lg">
        Supabase connection status:{' '}
        {isConnected === null ? (
          <span className="text-gray-500">Checking...</span>
        ) : isConnected ? (
          <span className="text-green-500">Connected</span>
        ) : (
          <span className="text-red-500">Failed to connect</span>
        )}
      </div>
    </main>
  );
} 