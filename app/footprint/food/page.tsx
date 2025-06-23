'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase';
import Link from 'next/link';

type FoodEntry = {
  id?: number;
  household_id: string;
  date: string;
  type: string;
  image_url: string | null;
  co2e: number | null;
};

type FoodDetail = {
  id?: number;
  household_id: string;
  date: string;
  item: string;
  category: string | null;
  packaged: boolean;
  CI_custom: number | null;
  co2e_kg: number;
  food_entry_id: number;
};

const STORAGE_KEY = 'foodFormData';

export default function FoodPage() {
  const { user } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [foodEntry, setFoodEntry] = useState<FoodEntry>({
    household_id: '',
    date: new Date().toISOString().split('T')[0],
    type: '',
    image_url: null,
    co2e: null
  });
  const [foodDetails, setFoodDetails] = useState<FoodDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(true);
  const [rawData, setRawData] = useState<FoodEntry[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FoodEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [processingOCR, setProcessingOCR] = useState(false);
  const [extractedItems, setExtractedItems] = useState<Array<{
    item: string;
    price?: string;
    quantity?: string;
    category?: string;
  }>>([]);

  // Fetch household ID for the user
  useEffect(() => {
    const fetchHouseholdId = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching household ID:', error);
        return;
      }

      if (data) {
        setHouseholdId(data.id);
        // Update foodEntry with the household ID
        setFoodEntry(prev => ({
          ...prev,
          household_id: data.id
        }));
      }
    };

    fetchHouseholdId();
  }, [user]);

  // Update foodEntry when householdId changes
  useEffect(() => {
    if (householdId) {
      setFoodEntry(prev => ({
        ...prev,
        household_id: householdId
      }));
    }
  }, [householdId]);

  // Fetch food entries for the household
  useEffect(() => {
    const fetchFoodEntries = async () => {
      if (!user || !householdId) return;

      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('household_id', householdId)
        .order('date', { ascending: false });

      if (error) {
        console.error('Error fetching food entries:', error);
        return;
      }

      if (data) {
        setRawData(data);
      }
    };

    fetchFoodEntries();
  }, [user, householdId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const uploadImage = async (file: File, foodEntryId: number): Promise<string> => {
    try {
      if (!householdId) {
        throw new Error('Household ID is required for image upload');
      }
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${foodEntryId}-${Math.random()}.${fileExt}`;
      const filePath = `receipts/${householdId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('food')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('food')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId) {
      setError('Please sign in to save data');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // First, create the food entry
      const { data: entryData, error: entryError } = await supabase
        .from('food_entries')
        .insert([{
          household_id: householdId,
          date: foodEntry.date,
          type: foodEntry.type,
          co2e: 0 // Will be updated after food details are added
        }])
        .select()
        .single();

      if (entryError) {
        console.error('Error creating food entry:', entryError);
        throw entryError;
      }

      // If there's an image, upload it
      let imageUrl = null;
      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile, entryData.id);
        
        // Update the entry with the image URL
        const { error: updateError } = await supabase
          .from('food_entries')
          .update({ image_url: imageUrl })
          .eq('id', entryData.id);

        if (updateError) {
          console.error('Error updating image URL:', updateError);
          throw updateError;
        }
      }

      // Add food details
      if (foodDetails.length > 0) {
        const detailsWithEntryId = foodDetails.map(detail => ({
          ...detail,
          food_entry_id: entryData.id,
          household_id: householdId,
          date: foodEntry.date
        }));

        const { error: detailsError } = await supabase
          .from('food_details')
          .insert(detailsWithEntryId);

        if (detailsError) {
          console.error('Error inserting food details:', detailsError);
          throw detailsError;
        }

        // Calculate total CO2e
        const totalCO2e = foodDetails.reduce((sum, detail) => sum + detail.co2e_kg, 0);

        // Update the entry with the total CO2e
        const { error: updateError } = await supabase
          .from('food_entries')
          .update({ co2e: totalCO2e })
          .eq('id', entryData.id);

        if (updateError) {
          console.error('Error updating CO2e:', updateError);
          throw updateError;
        }
      }

      setSuccess('Food entry saved successfully!');
      setIsNewEntry(true);
      setFoodEntry({
        household_id: householdId,
        date: new Date().toISOString().split('T')[0],
        type: '',
        image_url: null,
        co2e: null
      });
      setFoodDetails([]);
      setSelectedFile(null);
      setUploadProgress(0);

    } catch (error) {
      console.error('Error saving food entry:', error);
      setError('Failed to save food entry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFoodEntry(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addFoodDetail = () => {
    if (!householdId) {
      console.error('Cannot add food detail: household ID is missing');
      return;
    }
    
    setFoodDetails(prev => [...prev, {
      household_id: householdId,
      date: foodEntry.date,
      item: '',
      category: null,
      packaged: false,
      CI_custom: null,
      co2e_kg: 0,
      food_entry_id: 0 // Will be set when the entry is created
    }]);
  };

  const updateFoodDetail = (index: number, field: keyof FoodDetail, value: any) => {
    setFoodDetails(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const handleEdit = async (entry: FoodEntry) => {
    setEditingId(entry.id!);
    setEditForm(entry);
    
    // Fetch food details for this entry
    const { data: details, error } = await supabase
      .from('food_details')
      .select('*')
      .eq('food_entry_id', entry.id);

    if (error) {
      console.error('Error fetching food details:', error);
      return;
    }

    if (details) {
      setFoodDetails(details);
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !householdId) return;

    try {
      // First delete the food details
      const { error: detailsError } = await supabase
        .from('food_details')
        .delete()
        .eq('food_entry_id', id)
        .eq('household_id', householdId);

      if (detailsError) throw detailsError;

      // Then delete the food entry
      const { error: entryError } = await supabase
        .from('food_entries')
        .delete()
        .eq('id', id)
        .eq('household_id', householdId);

      if (entryError) throw entryError;

      // Update the UI
      setRawData(prev => prev.filter(entry => entry.id !== id));
      setSuccess('Food entry deleted successfully!');
    } catch (error) {
      console.error('Error deleting food entry:', error);
      setError('Failed to delete food entry. Please try again.');
    }
  };

  const processReceiptOCR = async (file: File) => {
    setProcessingOCR(true);
    setError(null);
    
    try {
      console.log('Converting file to base64 for OCR processing...');
      
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:image/...;base64, prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      console.log('Sending OCR request with base64 image data...');
      
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          imageData: base64,
          imageType: file.type 
        }),
      });

      console.log('OCR API response status:', response.status);
      
      const data = await response.json();
      console.log('OCR API response data:', data);

      if (data.success) {
        setExtractedItems(data.extractedItems);
        console.log('Extracted items:', data.extractedItems);
      } else {
        console.error('OCR processing failed:', data.error);
        console.error('Error details:', data.details);
        setError(`OCR processing failed: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
      }
    } catch (error) {
      console.error('Error processing OCR:', error);
      setError(`Failed to process receipt image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessingOCR(false);
    }
  };

  const addExtractedItem = (extractedItem: {
    item: string;
    price?: string;
    quantity?: string;
    category?: string;
  }) => {
    setFoodDetails(prev => [...prev, {
      household_id: householdId || '',
      date: foodEntry.date,
      item: extractedItem.item,
      category: extractedItem.category || null,
      packaged: false,
      CI_custom: null,
      co2e_kg: 0,
      food_entry_id: 0
    }]);
  };

  const addAllExtractedItems = () => {
    extractedItems.forEach(item => {
      addExtractedItem(item);
    });
    setExtractedItems([]); // Clear the extracted items after adding them
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-24">
        <h1 className="text-4xl font-bold mb-8">Please sign in to continue</h1>
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
      <div className="w-full max-w-2xl">
        <div className="flex items-center mb-8">
          <Link href="/" className="text-indigo-600 hover:text-indigo-800 mr-4">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Food Consumption</h1>
        </div>

        {loading ? (
          <div className="text-lg">Loading...</div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                    Date
                  </label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={foodEntry.date}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                    Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={foodEntry.type}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select a type</option>
                    <option value="grocery">Grocery Shopping</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="takeout">Takeout</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="image" className="block text-sm font-medium text-gray-700">
                    Receipt Image (Optional)
                  </label>
                  <input
                    type="file"
                    id="image"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="mt-1 block w-full"
                  />
                  {selectedFile && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          processReceiptOCR(selectedFile);
                        }}
                        disabled={processingOCR}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        {processingOCR ? 'Processing...' : 'Process Receipt with OCR'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Display extracted items */}
                {extractedItems.length > 0 && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium text-blue-900">
                        Extracted Items ({extractedItems.length})
                      </h3>
                      <div className="space-x-2">
                        <button
                          type="button"
                          onClick={addAllExtractedItems}
                          className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          Add All
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtractedItems([])}
                          className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {extractedItems.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-white rounded border">
                          <div className="flex-1">
                            <div className="font-medium">{item.item}</div>
                            <div className="text-sm text-gray-600">
                              {item.category && <span className="capitalize">{item.category}</span>}
                              {item.price && <span className="ml-2">${item.price}</span>}
                              {item.quantity && <span className="ml-2">Qty: {item.quantity}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addExtractedItem(item)}
                            className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Food Items</h3>
                    <button
                      type="button"
                      onClick={addFoodDetail}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      Add Item
                    </button>
                  </div>

                  {foodDetails.map((detail, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={detail.item}
                          onChange={(e) => updateFoodDetail(index, 'item', e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Category
                        </label>
                        <select
                          value={detail.category || ''}
                          onChange={(e) => updateFoodDetail(index, 'category', e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        >
                          <option value="">Select a category</option>
                          <option value="meat">Meat</option>
                          <option value="dairy">Dairy</option>
                          <option value="produce">Produce</option>
                          <option value="grains">Grains</option>
                          <option value="processed">Processed Food</option>
                        </select>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`packaged-${index}`}
                          checked={detail.packaged}
                          onChange={(e) => updateFoodDetail(index, 'packaged', e.target.checked)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`packaged-${index}`} className="ml-2 block text-sm text-gray-900">
                          Packaged Item
                        </label>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Custom Carbon Intensity (kg CO2e/kg)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={detail.CI_custom || ''}
                          onChange={(e) => updateFoodDetail(index, 'CI_custom', e.target.value ? Number(e.target.value) : null)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}

                {success && (
                  <div className="text-green-500 text-sm">{success}</div>
                )}

                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Save Food Entry
                </button>
              </form>
            </div>

            {rawData.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">Your Food Entries</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CO2e (kg)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rawData.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.date}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.type}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.co2e?.toFixed(2) || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {entry.image_url ? (
                              <a
                                href={entry.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                View Receipt
                              </a>
                            ) : (
                              'No receipt'
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleEdit(entry)}
                              className="text-indigo-600 hover:text-indigo-900 mr-2"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id!)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
} 