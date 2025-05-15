'use client';
import React, { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useAuth } from './context/AuthContext';
import Link from 'next/link';
import FootprintForm from './components/FootprintForm';

ChartJS.register(ArcElement, Tooltip, Legend);

type FootprintData = {
  transportation: number;
  home_electricity: number;
  home_natural_gas: number;
  food: number;
  water: number;
  stuff: number;
};

export default function Home() {
  const { user, signOut } = useAuth();
  const [footprintData, setFootprintData] = useState<FootprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const userData = user.user_metadata?.footprint_data;
      if (userData) {
        setFootprintData(userData);
      }
      setLoading(false);
    }
  }, [user]);

  const formatValue = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toLocaleString();
  };

  const chartData = footprintData ? {
    labels: [
      'Transportation',
      'Home Electricity',
      'Home Natural Gas',
      'Food',
      'Water',
      'Stuff'
    ],
    datasets: [
      {
        data: [
          footprintData.transportation,
          footprintData.home_electricity,
          footprintData.home_natural_gas,
          footprintData.food,
          footprintData.water,
          footprintData.stuff
        ],
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40'
        ],
        borderColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40'
        ],
        borderWidth: 1,
      },
    ],
  } : null;

  const chartOptions = {
    plugins: {
      legend: {
        position: 'right' as const,
      },
      title: {
        display: true,
        text: 'Your Carbon Footprint by Sector',
      },
    },
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-24">
        <h1 className="text-4xl font-bold mb-8">Welcome to Your Footprint</h1>
        <p className="text-lg mb-8">Please sign in to view your carbon footprint data.</p>
        <Link
          href="/auth/login"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="w-full max-w-6xl flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Your Carbon Footprint</h1>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Sign Out
        </button>
      </div>

      {loading ? (
        <div className="text-lg">Loading...</div>
      ) : error ? (
        <div className="text-red-500 text-lg">{error}</div>
      ) : (
        <div className="w-full max-w-6xl space-y-8">
          {chartData && (
            <div className="w-full bg-white p-6 rounded-lg shadow">
              <div className="h-96">
                <Pie data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          <div className="w-full bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Update Your Footprint Data</h2>
            <FootprintForm />
          </div>
        </div>
      )}
    </main>
  );
} 