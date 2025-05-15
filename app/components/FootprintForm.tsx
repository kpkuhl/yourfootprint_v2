'use client';
import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../context/AuthContext';

type FootprintFormData = {
  transportation: number;
  home_electricity: number;
  home_natural_gas: number;
  food: number;
  water: number;
  stuff: number;
};

export default function FootprintForm() {
  const { user } = useAuth();
  const [formData, setFormData] = useState<FootprintFormData>({
    transportation: 0,
    home_electricity: 0,
    home_natural_gas: 0,
    food: 0,
    water: 0,
    stuff: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          footprint_data: formData
        }
      });

      if (error) throw error;

      setSuccess(true);
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while saving data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Transportation</label>
          <input
            type="number"
            name="transportation"
            value={formData.transportation}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            step="0.01"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Home Electricity</label>
          <input
            type="number"
            name="home_electricity"
            value={formData.home_electricity}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            step="0.01"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Home Natural Gas</label>
          <input
            type="number"
            name="home_natural_gas"
            value={formData.home_natural_gas}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            step="0.01"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Food</label>
          <input
            type="number"
            name="food"
            value={formData.food}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            step="0.01"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Water</label>
          <input
            type="number"
            name="water"
            value={formData.water}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            step="0.01"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Stuff</label>
          <input
            type="number"
            name="stuff"
            value={formData.stuff}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            step="0.01"
            required
          />
        </div>
      </div>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      {success && (
        <div className="text-green-500 text-sm">Data saved successfully!</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        {loading ? 'Saving...' : 'Save Footprint Data'}
      </button>
    </form>
  );
} 