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
  packaging_type?: string[] | null;
  CI_custom: number | null;
  co2e_kg: number;
  packaging_co2e_kg: number;
  food_entry_id: number;
  kg_food: number | null;
};

type DefaultCI = {
  category: string;
  CI_kg: number;
};

type RestaurantMeal = {
  id: number;
  meal: string;
  co2e_kg: number;
};

type RestaurantMealEntry = {
  meal_id: number;
  meal_name: string;
  quantity: number;
  co2e_kg: number;
};

type PackagingCI = {
  id: number;
  packaging: string;
  co2e_kg: number;
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
    packaging?: string | string[];
    CI_custom?: number | null;
  }>>([]);
  const [defaultCIValues, setDefaultCIValues] = useState<DefaultCI[]>([]);
  const [restaurantMeals, setRestaurantMeals] = useState<RestaurantMeal[]>([]);
  const [restaurantMealEntries, setRestaurantMealEntries] = useState<RestaurantMealEntry[]>([]);
  const [packagingCIValues, setPackagingCIValues] = useState<PackagingCI[]>([]);

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

  // Fetch default carbon intensity values
  useEffect(() => {
    const fetchDefaultCI = async () => {
      const { data, error } = await supabase
        .from('CI_food_default_kg')
        .select('category, CI_kg')
        .eq('food', 'default')
        .order('category');

      if (error) {
        console.error('Error fetching default CI values:', error);
        return;
      }

      setDefaultCIValues(data || []);
    };

    fetchDefaultCI();
  }, []);

  // Fetch restaurant meals
  useEffect(() => {
    const fetchRestaurantMeals = async () => {
      const { data, error } = await supabase
        .from('restaurant_meals')
        .select('*')
        .order('meal');

      if (error) {
        console.error('Error fetching restaurant meals:', error);
        return;
      }

      setRestaurantMeals(data || []);
    };

    fetchRestaurantMeals();
  }, []);

  // Fetch packaging CI values
  useEffect(() => {
    const fetchPackagingCI = async () => {
      const { data, error } = await supabase
        .from('packaging_CI')
        .select('*')
        .order('packaging');

      if (error) {
        console.error('Error fetching packaging CI values:', error);
        return;
      }

      setPackagingCIValues(data || []);
    };

    fetchPackagingCI();
  }, []);

  // Function to get carbon intensity for a food item
  const getCarbonIntensity = (category: string | null, customCI: number | null): number => {
    // If custom CI is provided, use it
    if (customCI !== null) {
      return customCI;
    }

    // If no category, use a default value
    if (!category) {
      return 2.0; // Default moderate carbon intensity
    }

    // Find the default CI for the category with more robust matching
    const defaultCI = defaultCIValues.find(ci => 
      ci.category.trim().toLowerCase() === category.trim().toLowerCase()
    );
    
    return defaultCI ? defaultCI.CI_kg : 2.0; // Fallback to moderate default
  };

  // Function to calculate CO2e for a food item
  const calculateFoodCO2e = (kgFood: number | null, category: string | null, customCI: number | null): number => {
    if (!kgFood || kgFood <= 0) {
      return 0;
    }

    const carbonIntensity = getCarbonIntensity(category, customCI);
    return kgFood * carbonIntensity;
  };

  // Function to calculate packaging CO2e
  const calculatePackagingCO2e = (kgFood: number | null, packagingTypes: string[] | null): number => {
    if (!kgFood || kgFood <= 0 || !packagingTypes || packagingTypes.length === 0) {
      return 0;
    }

    // Filter out 'none' from packaging types
    const validPackagingTypes = packagingTypes.filter(type => type !== 'none');
    if (validPackagingTypes.length === 0) {
      return 0;
    }

    // Calculate packaging weight as 7.37% of food weight
    const packagingWeight = kgFood * 0.0737;
    
    // Split packaging weight equally between different types
    const weightPerType = packagingWeight / validPackagingTypes.length;
    
    // Calculate total packaging CO2e
    let totalPackagingCO2e = 0;
    
    validPackagingTypes.forEach(packagingType => {
      const packagingCI = packagingCIValues.find(ci => 
        ci.packaging.trim().toLowerCase() === packagingType.trim().toLowerCase()
      );
      
      if (packagingCI) {
        totalPackagingCO2e += weightPerType * packagingCI.co2e_kg;
      }
    });
    
    return totalPackagingCO2e;
  };

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

  const compressImage = (file: File, maxWidth: number = 1024): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        const newWidth = img.width * ratio;
        const newHeight = img.height * ratio;
        
        // Set canvas size
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, newWidth, newHeight);
        
        // Convert to blob with compression
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        }, 'image/jpeg', 0.7); // 70% quality
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId) {
      setError('Please sign in to save data');
      return;
    }

    // If we're editing an existing entry, use the edit submit function
    if (editingId) {
      await handleEditSubmit(e);
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
      }

      // Add restaurant meal entries if type is Restaurant/Take Out
      if (foodEntry.type === 'Restaurant/Take Out' && restaurantMealEntries.length > 0) {
        const restaurantDetails = restaurantMealEntries.map(mealEntry => ({
          household_id: householdId,
          date: foodEntry.date,
          item: mealEntry.meal_name,
          category: 'Restaurant Meal',
          packaged: false,
          packaging_type: null,
          CI_custom: null,
          co2e_kg: mealEntry.co2e_kg * mealEntry.quantity,
          food_entry_id: entryData.id,
          kg_food: mealEntry.quantity
        }));

        const { error: restaurantError } = await supabase
          .from('food_details')
          .insert(restaurantDetails);

        if (restaurantError) {
          console.error('Error inserting restaurant meal details:', restaurantError);
          throw restaurantError;
        }
      }

      // Calculate total CO2e from both food details and restaurant meals
      const foodDetailsCO2e = foodDetails.reduce((sum, detail) => sum + detail.co2e_kg + detail.packaging_co2e_kg, 0);
      const restaurantMealsCO2e = restaurantMealEntries.reduce((sum, meal) => sum + (meal.co2e_kg * meal.quantity), 0);
      const totalCO2e = foodDetailsCO2e + restaurantMealsCO2e;

      // Update the entry with the total CO2e
      const { error: updateError } = await supabase
        .from('food_entries')
        .update({ co2e: totalCO2e })
        .eq('id', entryData.id);

      if (updateError) {
        console.error('Error updating CO2e:', updateError);
        throw updateError;
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
      setRestaurantMealEntries([]);
      setSelectedFile(null);
      setUploadProgress(0);

    } catch (error) {
      console.error('Error saving food entry:', error);
      setError('Failed to save food entry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !householdId || !editingId) {
      setError('Please sign in to save data');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Update the food entry
      const { error: entryError } = await supabase
        .from('food_entries')
        .update({
          date: foodEntry.date,
          type: foodEntry.type
        })
        .eq('id', editingId)
        .eq('household_id', householdId);

      if (entryError) {
        console.error('Error updating food entry:', entryError);
        throw entryError;
      }

      // Delete existing food details
      const { error: deleteError } = await supabase
        .from('food_details')
        .delete()
        .eq('food_entry_id', editingId)
        .eq('household_id', householdId);

      if (deleteError) {
        console.error('Error deleting existing food details:', deleteError);
        throw deleteError;
      }

      // Add updated food details
      if (foodDetails.length > 0) {
        const detailsWithEntryId = foodDetails.map(detail => ({
          ...detail,
          food_entry_id: editingId,
          household_id: householdId,
          date: foodEntry.date
        }));

        const { error: detailsError } = await supabase
          .from('food_details')
          .insert(detailsWithEntryId);

        if (detailsError) {
          console.error('Error inserting updated food details:', detailsError);
          throw detailsError;
        }
      }

      // Add restaurant meal entries if type is Restaurant/Take Out
      if (foodEntry.type === 'Restaurant/Take Out' && restaurantMealEntries.length > 0) {
        const restaurantDetails = restaurantMealEntries.map(mealEntry => ({
          household_id: householdId,
          date: foodEntry.date,
          item: mealEntry.meal_name,
          category: 'Restaurant Meal',
          packaged: false,
          packaging_type: null,
          CI_custom: null,
          co2e_kg: mealEntry.co2e_kg * mealEntry.quantity,
          food_entry_id: editingId,
          kg_food: mealEntry.quantity
        }));

        const { error: restaurantError } = await supabase
          .from('food_details')
          .insert(restaurantDetails);

        if (restaurantError) {
          console.error('Error inserting restaurant meal details:', restaurantError);
          throw restaurantError;
        }
      }

      // Calculate total CO2e from both food details and restaurant meals
      const foodDetailsCO2e = foodDetails.reduce((sum, detail) => sum + detail.co2e_kg + detail.packaging_co2e_kg, 0);
      const restaurantMealsCO2e = restaurantMealEntries.reduce((sum, meal) => sum + (meal.co2e_kg * meal.quantity), 0);
      const totalCO2e = foodDetailsCO2e + restaurantMealsCO2e;

      // Update the entry with the total CO2e
      const { error: updateError } = await supabase
        .from('food_entries')
        .update({ co2e: totalCO2e })
        .eq('id', editingId);

      if (updateError) {
        console.error('Error updating CO2e:', updateError);
        throw updateError;
      }

      setSuccess('Food entry updated successfully!');
      setEditingId(null);
      setEditForm(null);
      setIsNewEntry(true);
      setFoodEntry({
        household_id: householdId,
        date: new Date().toISOString().split('T')[0],
        type: '',
        image_url: null,
        co2e: null
      });
      setFoodDetails([]);
      setRestaurantMealEntries([]);
      setSelectedFile(null);
      setUploadProgress(0);

    } catch (error) {
      console.error('Error updating food entry:', error);
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
    const newDetail: FoodDetail = {
      household_id: householdId || '',
      date: foodEntry.date,
      item: '',
      category: null,
      packaged: false,
      packaging_type: null,
      CI_custom: null,
      co2e_kg: 0, // Will be calculated when kg_food is set
      packaging_co2e_kg: 0, // Will be calculated when kg_food and packaging_type are set
      food_entry_id: 0,
      kg_food: null
    };
    setFoodDetails(prev => [...prev, newDetail]);
  };

  const updateFoodDetail = (index: number, field: keyof FoodDetail, value: any) => {
    setFoodDetails(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Recalculate CO2e if kg_food, category, or CI_custom changed
      if (field === 'kg_food' || field === 'category' || field === 'CI_custom') {
        const detail = updated[index];
        updated[index].co2e_kg = calculateFoodCO2e(
          detail.kg_food, 
          detail.category, 
          detail.CI_custom
        );
      }
      
      // Recalculate packaging CO2e if kg_food or packaging_type changed
      if (field === 'kg_food' || field === 'packaging_type') {
        const detail = updated[index];
        updated[index].packaging_co2e_kg = calculatePackagingCO2e(
          detail.kg_food,
          detail.packaging_type
        );
      }
      
      return updated;
    });
  };

  const handleEdit = async (entry: FoodEntry) => {
    setEditingId(entry.id!);
    setEditForm(entry);
    setFoodEntry(entry);
    
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
      // Separate regular food details from restaurant meals
      const regularFoodDetails = details.filter(detail => detail.category !== 'Restaurant Meal');
      const restaurantMealDetails = details.filter(detail => detail.category === 'Restaurant Meal');
      
      setFoodDetails(regularFoodDetails);
      
      // Convert restaurant meal details back to restaurant meal entries
      const mealEntries = restaurantMealDetails.map(detail => {
        const meal = restaurantMeals.find(m => m.meal === detail.item);
        return {
          meal_id: meal?.id || 0,
          meal_name: detail.item,
          quantity: detail.kg_food || 1,
          co2e_kg: meal?.co2e_kg || 0
        };
      });
      
      setRestaurantMealEntries(mealEntries);
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
    if (!file) return;

    try {
      setProcessingOCR(true);
      setError(null);

      // Check file size first
      if (file.size > 4 * 1024 * 1024) { // 4MB limit
        setError('Image file is too large. Please use an image smaller than 4MB.');
        return;
      }

      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Compress image if it's too large
      let processedFile = file;
      if (file.size > 1024 * 1024) { // 1MB limit
        processedFile = await compressImage(file, 800); // Use existing compressImage function
      }

      // Convert processed file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(processedFile);
      });

      // Set up timeout for the fetch request
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OCR request timed out')), 30000);
      });
      
      // Create the fetch promise
      const fetchPromise = fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          imageData: base64,
          imageType: processedFile.type 
        }),
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (response.status === 413) {
        setError('Image is too large for processing. Please try a smaller image (under 1MB).');
        return;
      }
      
      const data = await response.json();

      if (response.status === 429) {
        // Rate limit exceeded
        const resetTime = data.resetTime ? new Date(data.resetTime).toLocaleString() : '5 minutes';
        setError(`Rate limit exceeded. You can only process 1 image every 5 minutes. Please try again after ${resetTime}.`);
      } else if (data.success) {
        setExtractedItems(data.extractedItems);
      } else {
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
    packaging?: string | string[];
    CI_custom?: number | null;
  }) => {
    const kgFood = extractedItem.quantity ? parseFloat(extractedItem.quantity) : null;
    const co2e_kg = calculateFoodCO2e(kgFood, extractedItem.category || null, extractedItem.CI_custom || null);
    const packaging_co2e_kg = calculatePackagingCO2e(kgFood, Array.isArray(extractedItem.packaging) ? extractedItem.packaging : null);

    setFoodDetails(prev => [...prev, {
      household_id: householdId || '',
      date: foodEntry.date,
      item: extractedItem.item,
      category: extractedItem.category || null,
      packaged: Array.isArray(extractedItem.packaging) 
        ? extractedItem.packaging.some(p => p !== 'none')
        : (extractedItem.packaging && extractedItem.packaging !== 'none'),
      packaging_type: Array.isArray(extractedItem.packaging) ? extractedItem.packaging : null,
      CI_custom: extractedItem.CI_custom || null,
      co2e_kg,
      packaging_co2e_kg,
      food_entry_id: 0,
      kg_food: kgFood
    }]);
    
    // Remove the item from extracted items after adding it
    setExtractedItems(prev => prev.filter(item => item !== extractedItem));
  };

  const addAllExtractedItems = () => {
    const newFoodDetails = extractedItems.map(item => {
      const kgFood = item.quantity ? parseFloat(item.quantity) : null;
      const co2e_kg = calculateFoodCO2e(kgFood, item.category || null, item.CI_custom || null);
      const packaging_co2e_kg = calculatePackagingCO2e(kgFood, Array.isArray(item.packaging) ? item.packaging : null);

      return {
        household_id: householdId || '',
        date: foodEntry.date,
        item: item.item,
        category: item.category || null,
        packaged: Array.isArray(item.packaging) 
          ? item.packaging.some(p => p !== 'none')
          : (item.packaging && item.packaging !== 'none'),
        packaging_type: Array.isArray(item.packaging) ? item.packaging : null,
        CI_custom: item.CI_custom || null,
        co2e_kg,
        packaging_co2e_kg,
        food_entry_id: 0,
        kg_food: kgFood
      };
    });
    
    setFoodDetails(prev => [...prev, ...newFoodDetails]);
    setExtractedItems([]);
  };

  const addRestaurantMealEntry = () => {
    if (restaurantMeals.length > 0) {
      const firstMeal = restaurantMeals[0];
      setRestaurantMealEntries(prev => [...prev, {
        meal_id: firstMeal.id,
        meal_name: firstMeal.meal,
        quantity: 1,
        co2e_kg: firstMeal.co2e_kg
      }]);
    }
  };

  const updateRestaurantMealEntry = (index: number, field: keyof RestaurantMealEntry, value: any) => {
    setRestaurantMealEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // If updating meal_id, also update meal_name and co2e_kg
      if (field === 'meal_id') {
        const selectedMeal = restaurantMeals.find(meal => meal.id === value);
        if (selectedMeal) {
          updated[index].meal_name = selectedMeal.meal;
          updated[index].co2e_kg = selectedMeal.co2e_kg;
        }
      }
      
      return updated;
    });
  };

  const removeRestaurantMealEntry = (index: number) => {
    setRestaurantMealEntries(prev => prev.filter((_, i) => i !== index));
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
                    <option value="Grocery Store">Grocery Store</option>
                    <option value="Restaurant/Take Out">Restaurant/Take Out</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="image" className="block text-sm font-medium text-gray-700">
                    Image (optional)
                  </label>
                  <input
                    type="file"
                    id="image"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
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
                    <div className="space-y-3">
                      {extractedItems.map((item, index) => (
                        <div key={index} className="bg-white rounded border p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <div className="mb-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Item Name
                                </label>
                                <input
                                  type="text"
                                  value={item.item}
                                  onChange={(e) => {
                                    const newItems = [...extractedItems];
                                    newItems[index] = {
                                      ...newItems[index],
                                      item: e.target.value
                                    };
                                    setExtractedItems(newItems);
                                  }}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  placeholder="Enter item name"
                                />
                              </div>
                              {item.price && (
                                <div className="text-sm text-gray-600">Price: {item.price}</div>
                              )}
                            </div>
                            <div className="flex space-x-2 ml-2">
                              <button
                                type="button"
                                onClick={() => addExtractedItem(item)}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = [...extractedItems];
                                  newItems.splice(index, 1);
                                  setExtractedItems(newItems);
                                }}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          
                          {/* Quantity and Category Selection */}
                          <div className="grid grid-cols-3 gap-3 mt-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Quantity (kg)
                              </label>
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={item.quantity || ''}
                                onChange={(e) => {
                                  const newItems = [...extractedItems];
                                  newItems[index] = {
                                    ...newItems[index],
                                    quantity: e.target.value
                                  };
                                  setExtractedItems(newItems);
                                }}
                                placeholder="1.0"
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Category
                              </label>
                              <select
                                value={item.category || ''}
                                onChange={(e) => {
                                  const newItems = [...extractedItems];
                                  newItems[index] = {
                                    ...newItems[index],
                                    category: e.target.value
                                  };
                                  setExtractedItems(newItems);
                                }}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Select category</option>
                                <option value="Beef">Beef</option>
                                <option value="Meat (not beef)">Meat (not beef)</option>
                                <option value="Milk, Eggs, Butter, Oil">Milk, Eggs, Butter, Oil</option>
                                <option value="Grain, Nuts, Beans">Grain, Nuts, Beans</option>
                                <option value="Produce">Produce</option>
                                <option value="Processed Food (w/ meat or cheese)">Processed Food (w/ meat or cheese)</option>
                                <option value="Processed Food (no meat or cheese)">Processed Food (no meat or cheese)</option>
                                <option value="Cheese">Cheese</option>
                                <option value="Coffee, Tea">Coffee, Tea</option>
                                <option value="Chocolate">Chocolate</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Packaging
                              </label>
                              <div className="space-y-1 max-h-24 overflow-y-auto">
                                {['none', 'glass', 'plastic', 'steel', 'aluminum', 'paper or cardboard'].map((packagingType) => (
                                  <label key={packagingType} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={item.packaging?.includes(packagingType) || false}
                                      onChange={(e) => {
                                        const newItems = [...extractedItems];
                                        const currentPackaging = newItems[index].packaging || [];
                                        const packagingArray = Array.isArray(currentPackaging) ? currentPackaging : [];
                                        
                                        if (e.target.checked) {
                                          // Add packaging type
                                          if (packagingType === 'none') {
                                            // If "none" is selected, clear all others
                                            newItems[index] = {
                                              ...newItems[index],
                                              packaging: ['none']
                                            };
                                          } else {
                                            // Add the packaging type and remove "none" if it was selected
                                            const updatedPackaging = packagingArray.filter(p => p !== 'none');
                                            if (!updatedPackaging.includes(packagingType)) {
                                              updatedPackaging.push(packagingType);
                                            }
                                            newItems[index] = {
                                              ...newItems[index],
                                              packaging: updatedPackaging
                                            };
                                          }
                                        } else {
                                          // Remove packaging type
                                          const updatedPackaging = packagingArray.filter(p => p !== packagingType);
                                          newItems[index] = {
                                            ...newItems[index],
                                            packaging: updatedPackaging.length > 0 ? updatedPackaging : ['none']
                                          };
                                        }
                                        setExtractedItems(newItems);
                                      }}
                                      className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
                                    />
                                    <span className="text-xs text-gray-700 capitalize">{packagingType}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Custom Carbon Intensity (kg CO2e/kg)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.CI_custom || ''}
                              onChange={(e) => {
                                const newItems = [...extractedItems];
                                newItems[index] = {
                                  ...newItems[index],
                                  CI_custom: e.target.value ? Number(e.target.value) : null
                                };
                                setExtractedItems(newItems);
                              }}
                              placeholder="Leave empty for default"
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Override default category values if you have more accurate data
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Typical ranges: Beef (20-60), Meat (10-30), Dairy (1-5), Produce (0.1-2), Grains (0.5-3), Processed (1-8)
                            </p>
                          </div>
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
                          <option value="Beef">Beef</option>
                          <option value="Meat (not beef)">Meat (not beef)</option>
                          <option value="Milk, Eggs, Butter, Oil">Milk, Eggs, Butter, Oil</option>
                          <option value="Grain, Nuts, Beans">Grain, Nuts, Beans</option>
                          <option value="Produce">Produce</option>
                          <option value="Processed Food (w/ meat or cheese)">Processed Food (w/ meat or cheese)</option>
                          <option value="Processed Food (no meat or cheese)">Processed Food (no meat or cheese)</option>
                          <option value="Cheese">Cheese</option>
                          <option value="Coffee, Tea">Coffee, Tea</option>
                          <option value="Chocolate">Chocolate</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Quantity (kg)
                        </label>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={detail.kg_food || ''}
                          onChange={(e) => updateFoodDetail(index, 'kg_food', e.target.value ? parseFloat(e.target.value) : null)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          placeholder="1.0"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Packaging
                        </label>
                        <div className="space-y-2 mt-2">
                          {['none', 'glass', 'plastic', 'steel', 'aluminum', 'paper or cardboard'].map((packagingType) => (
                            <label key={packagingType} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={
                                  packagingType === 'none' 
                                    ? !detail.packaged 
                                    : (Array.isArray(detail.packaging_type) 
                                        ? detail.packaging_type.includes(packagingType)
                                        : detail.packaging_type === packagingType)
                                }
                                onChange={(e) => {
                                  const currentPackaging = detail.packaging_type || [];
                                  const packagingArray = Array.isArray(currentPackaging) ? currentPackaging : [];
                                  
                                  if (packagingType === 'none') {
                                    updateFoodDetail(index, 'packaged', !e.target.checked);
                                    updateFoodDetail(index, 'packaging_type', null);
                                  } else {
                                    if (e.target.checked) {
                                      // Add packaging type
                                      const updatedPackaging = packagingArray.filter(p => p !== 'none');
                                      if (!updatedPackaging.includes(packagingType)) {
                                        updatedPackaging.push(packagingType);
                                      }
                                      updateFoodDetail(index, 'packaged', true);
                                      updateFoodDetail(index, 'packaging_type', updatedPackaging);
                                    } else {
                                      // Remove packaging type
                                      const updatedPackaging = packagingArray.filter(p => p !== packagingType);
                                      updateFoodDetail(index, 'packaged', updatedPackaging.length > 0);
                                      updateFoodDetail(index, 'packaging_type', updatedPackaging.length > 0 ? updatedPackaging : null);
                                    }
                                  }
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
                              />
                              <span className="text-sm text-gray-700 capitalize">{packagingType}</span>
                            </label>
                          ))}
                        </div>
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
                        <p className="mt-1 text-sm text-gray-500">
                          Override default category values if you have more accurate data
                        </p>
                        <p className="mt-1 text-sm text-gray-400">
                          Typical ranges: Beef (20-60), Meat (10-30), Dairy (1-5), Produce (0.1-2), Grains (0.5-3), Processed (1-8)
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Calculated CO2e (kg)
                        </label>
                        <div className="mt-1 p-2 bg-gray-50 border border-gray-300 rounded-md">
                          <span className="text-lg font-semibold text-indigo-600">
                            {detail.co2e_kg.toFixed(3)} kg CO2e
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          Based on quantity × carbon intensity
                        </p>
                      </div>

                      {detail.packaging_co2e_kg > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Packaging CO2e (kg)
                          </label>
                          <div className="mt-1 p-2 bg-orange-50 border border-orange-300 rounded-md">
                            <span className="text-lg font-semibold text-orange-600">
                              {detail.packaging_co2e_kg.toFixed(3)} kg CO2e
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            Based on 7.37% of food weight × packaging carbon intensity
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Restaurant Meals Section - Only show when type is Restaurant/Take Out */}
                {foodEntry.type === 'Restaurant/Take Out' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Restaurant Meals</h3>
                      <button
                        type="button"
                        onClick={addRestaurantMealEntry}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Add Meal
                      </button>
                    </div>

                    {restaurantMealEntries.map((mealEntry, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Meal Type
                              </label>
                              <select
                                value={mealEntry.meal_id}
                                onChange={(e) => updateRestaurantMealEntry(index, 'meal_id', Number(e.target.value))}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                              >
                                <option value="">Select a meal</option>
                                {restaurantMeals.map((meal) => (
                                  <option key={meal.id} value={meal.id}>
                                    {meal.meal} ({meal.co2e_kg} kg CO2e/meal)
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Quantity
                              </label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={mealEntry.quantity}
                                onChange={(e) => updateRestaurantMealEntry(index, 'quantity', Number(e.target.value))}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                placeholder="1"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Total CO2e (kg)
                              </label>
                              <div className="mt-1 p-2 bg-gray-50 border border-gray-300 rounded-md">
                                <span className="text-lg font-semibold text-green-600">
                                  {(mealEntry.co2e_kg * mealEntry.quantity).toFixed(3)} kg CO2e
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-gray-500">
                                {mealEntry.quantity} × {mealEntry.co2e_kg} kg CO2e/meal
                              </p>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => removeRestaurantMealEntry(index)}
                            className="ml-4 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    {restaurantMealEntries.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <p>No restaurant meals added yet.</p>
                        <p className="text-sm mt-1">Click "Add Meal" to get started.</p>
                      </div>
                    )}
                  </div>
                )}

                {(foodDetails.length > 0 || restaurantMealEntries.length > 0) && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Total Carbon Footprint</h3>
                    <div className="text-2xl font-bold text-blue-600">
                      {(foodDetails.reduce((sum, detail) => sum + detail.co2e_kg + detail.packaging_co2e_kg, 0) + 
                        restaurantMealEntries.reduce((sum, meal) => sum + (meal.co2e_kg * meal.quantity), 0)).toFixed(3)} kg CO2e
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      Combined carbon footprint of {foodDetails.length} food item{foodDetails.length !== 1 ? 's' : ''}
                      {foodDetails.length > 0 && restaurantMealEntries.length > 0 ? ' and ' : ''}
                      {restaurantMealEntries.length > 0 ? `${restaurantMealEntries.length} restaurant meal${restaurantMealEntries.length !== 1 ? 's' : ''}` : ''}
                      {foodDetails.some(detail => detail.packaging_co2e_kg > 0) && ' (including packaging)'}
                    </p>
                  </div>
                )}

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