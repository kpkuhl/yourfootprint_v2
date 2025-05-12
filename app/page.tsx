'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';

type FootprintData = {
  id: number;
  category: string;
  value: number | null;
  unit: string;
  created_at: string;
};

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [footprintData, setFootprintData] = useState<FootprintData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        // Fetch footprint data directly without checking session first
        const { data, error } = await supabase
          .from('avg_monthly_us_household_footprint')
          .select('*')
          .order('id');

        if (error) throw error;
        
        if (mounted) {
          setFootprintData(data || []);
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        if (mounted) {
          setIsConnected(false);
          setError(error instanceof Error ? error.message : 'An error occurred while fetching data');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
    };
  }, []);

  const formatValue = (value: number | null) => {
    if (value === null) return 'N/A';
    return value.toLocaleString();
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <h1 className="text-4xl font-bold mb-8">US Household Carbon Footprint</h1>
      
      <div className="text-lg mb-8">
        Supabase connection status:{' '}
        {isConnected === null ? (
          <span className="text-gray-500">Checking...</span>
        ) : isConnected ? (
          <span className="text-green-500">Connected</span>
        ) : (
          <span className="text-red-500">Failed to connect</span>
        )}
      </div>

      {loading ? (
        <div className="text-lg">Loading data...</div>
      ) : error ? (
        <div className="text-red-500">Error: {error}</div>
      ) : footprintData.length === 0 ? (
        <div className="text-lg">No data available</div>
      ) : (
        <div className="w-full max-w-4xl">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-6 py-3 border-b text-left">Category</th>
                <th className="px-6 py-3 border-b text-right">Value</th>
                <th className="px-6 py-3 border-b text-left">Unit</th>
              </tr>
            </thead>
            <tbody>
              {footprintData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b">{item.category}</td>
                  <td className="px-6 py-4 border-b text-right">{formatValue(item.value)}</td>
                  <td className="px-6 py-4 border-b">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
} 