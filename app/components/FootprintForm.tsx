'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../context/AuthContext';

type FootprintFormData = {
  num_members: number;
  num_vehicles: number;
  zipcode: string;
  name: string;
  electricity: number;
  natural_gas: number;
  water: number;
  gasoline: number;
  air_travel: number;
  food: number;
  stuff: number;
  sq_ft: number;
};

export default function FootprintForm() {
  const { user } = useAuth();
  const [formData, setFormData] = useState<FootprintFormData>({
    num_members: 1,
    num_vehicles: 1,
    zipcode: '',
    name: '',
    electricity: 0,
    natural_gas: 0,
    water: 0,
    gasoline: 0,
    air_travel: 0,
    food: 0,
    stuff: 0,
    sq_ft: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchUserHousehold = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('households')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching household:', error);
          return;
        }

        if (data) {
          setFormData({
            num_members: data.num_members || 1,
            num_vehicles: data.num_vehicles || 1,
            zipcode: data.zipcode || '',
            name: data.name || '',
            electricity: data.electricity || 0,
            natural_gas: data.natural_gas || 0,
            water: data.water || 0,
            gasoline: data.gasoline || 0,
            air_travel: data.air_travel || 0,
            food: data.food || 0,
            stuff: data.stuff || 0,
            sq_ft: data.sq_ft || 0,
          });
        }
      } catch (error) {
        console.error('Error in fetchUserHousehold:', error);
      }
    };

    fetchUserHousehold();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be logged in to save data');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Calculate total monthly CO2e
      const total_monthly_co2e = 
        formData.electricity +
        formData.natural_gas +
        formData.water +
        formData.gasoline +
        formData.air_travel +
        formData.food +
        formData.stuff;

      const { error } = await supabase
        .from('households')
        .upsert({
          user_id: user.id,
          num_members: formData.num_members,
          num_vehicles: formData.num_vehicles,
          zipcode: formData.zipcode,
          name: formData.name,
          electricity: formData.electricity,
          natural_gas: formData.natural_gas,
          water: formData.water,
          gasoline: formData.gasoline,
          air_travel: formData.air_travel,
          food: formData.food,
          stuff: formData.stuff,
          sq_ft: formData.sq_ft,
          total_monthly_co2e,
          updated_at: new Date().toISOString(),
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
      [name]: name === 'zipcode' || name === 'name' ? value : parseFloat(value) || 0,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Household Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Zipcode</label>
          <input
            type="text"
            name="zipcode"
            value={formData.zipcode}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Number of Household Members</label>
          <input
            type="number"
            name="num_members"
            value={formData.num_members}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="1"
            required
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Number of Vehicles</label>
          <input
            type="number"
            name="num_vehicles"
            value={formData.num_vehicles}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Square Footage</label>
          <input
            type="number"
            name="sq_ft"
            value={formData.sq_ft}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Electricity (kg CO2e/month)</label>
          <input
            type="number"
            name="electricity"
            value={formData.electricity}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Natural Gas (kg CO2e/month)</label>
          <input
            type="number"
            name="natural_gas"
            value={formData.natural_gas}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Water (kg CO2e/month)</label>
          <input
            type="number"
            name="water"
            value={formData.water}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Gasoline (kg CO2e/month)</label>
          <input
            type="number"
            name="gasoline"
            value={formData.gasoline}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Air Travel (kg CO2e/month)</label>
          <input
            type="number"
            name="air_travel"
            value={formData.air_travel}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Food (kg CO2e/month)</label>
          <input
            type="number"
            name="food"
            value={formData.food}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Stuff (kg CO2e/month)</label>
          <input
            type="number"
            name="stuff"
            value={formData.stuff}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            min="0"
            required
            inputMode="decimal"
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