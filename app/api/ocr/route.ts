import { NextRequest, NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize the Google Cloud Vision client
let client: ImageAnnotatorClient;

try {
  console.log('Initializing Google Cloud Vision client...');
  console.log('Available environment variables:', {
    hasKeyFile: !!process.env.GOOGLE_CLOUD_KEY_FILE,
    hasCredentials: !!process.env.GOOGLE_CLOUD_CREDENTIALS,
    keyFilePath: process.env.GOOGLE_CLOUD_KEY_FILE,
  });

  // Try to use direct credentials first (better for Vercel)
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    console.log('Using direct credentials from environment variable');
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
      client = new ImageAnnotatorClient({
        credentials: credentials,
      });
    } catch (parseError) {
      console.error('Failed to parse GOOGLE_CLOUD_CREDENTIALS:', parseError);
      throw new Error('Invalid GOOGLE_CLOUD_CREDENTIALS format');
    }
  } 
  // Fall back to service account key file
  else if (process.env.GOOGLE_CLOUD_KEY_FILE) {
    console.log('Using service account key file:', process.env.GOOGLE_CLOUD_KEY_FILE);
    client = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    });
  } 
  // Fall back to default credentials (if running on Google Cloud)
  else {
    console.log('Using default credentials');
    client = new ImageAnnotatorClient();
  }
  console.log('Google Cloud Vision client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Google Cloud Vision client:', error);
  console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
  client = null as any;
}

export async function POST(request: NextRequest) {
  try {
    if (!client) {
      console.error('Google Cloud Vision client not initialized');
      return NextResponse.json(
        { error: 'Google Cloud Vision not configured. Please set up credentials.' },
        { status: 500 }
      );
    }

    const { imageUrl } = await request.json();

    if (!imageUrl) {
      console.error('No image URL provided');
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    console.log('Processing OCR for image:', imageUrl);

    // Validate the image URL
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('blob:')) {
      console.error('Invalid image URL format:', imageUrl);
      return NextResponse.json({ error: 'Invalid image URL format' }, { status: 400 });
    }

    // Perform OCR on the image
    console.log('Calling Google Cloud Vision API...');
    const [result] = await client.textDetection(imageUrl);
    console.log('Google Cloud Vision API response received');
    
    const detections = result.textAnnotations || [];
    console.log('Number of text detections:', detections.length);

    if (detections.length === 0) {
      console.log('No text detected in the image');
      return NextResponse.json({ 
        error: 'No text detected in the image',
        extractedItems: []
      });
    }

    // Get the full text
    const fullText = detections[0].description || '';
    console.log('Extracted text length:', fullText.length);
    console.log('First 200 characters of extracted text:', fullText.substring(0, 200));

    // Parse the text to extract food items
    const extractedItems = parseReceiptText(fullText);
    console.log('Parsed items count:', extractedItems.length);

    return NextResponse.json({
      success: true,
      fullText,
      extractedItems
    });

  } catch (error) {
    console.error('OCR processing error details:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: 'Failed to process image. Please check your Google Cloud Vision setup.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function parseReceiptText(text: string): Array<{
  item: string;
  price?: string;
  quantity?: string;
  category?: string;
}> {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const items: Array<{
    item: string;
    price?: string;
    quantity?: string;
    category?: string;
  }> = [];

  // Common food keywords to identify items
  const foodKeywords = [
    'milk', 'bread', 'eggs', 'cheese', 'yogurt', 'butter', 'cream',
    'beef', 'chicken', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
    'apple', 'banana', 'orange', 'tomato', 'lettuce', 'carrot', 'onion',
    'rice', 'pasta', 'flour', 'sugar', 'salt', 'pepper', 'oil',
    'cereal', 'oatmeal', 'granola', 'nuts', 'chips', 'cookies',
    'soda', 'juice', 'water', 'coffee', 'tea', 'beer', 'wine'
  ];

  // Price regex pattern
  const pricePattern = /\$?\d+\.\d{2}/;
  // Quantity regex pattern
  const quantityPattern = /(\d+(?:\.\d+)?)\s*(?:x|@|ea|each|lb|oz|kg|g)/i;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip header/footer lines
    if (trimmedLine.toLowerCase().includes('total') || 
        trimmedLine.toLowerCase().includes('subtotal') ||
        trimmedLine.toLowerCase().includes('tax') ||
        trimmedLine.toLowerCase().includes('change') ||
        trimmedLine.toLowerCase().includes('thank')) {
      continue;
    }

    // Extract price
    const priceMatch = trimmedLine.match(pricePattern);
    const price = priceMatch ? priceMatch[0] : undefined;

    // Extract quantity
    const quantityMatch = trimmedLine.match(quantityPattern);
    const quantity = quantityMatch ? quantityMatch[1] : undefined;

    // Extract item name (remove price and quantity from line)
    let itemName = trimmedLine;
    if (price) {
      itemName = itemName.replace(price, '').trim();
    }
    if (quantityMatch) {
      itemName = itemName.replace(quantityMatch[0], '').trim();
    }

    // Clean up item name
    itemName = itemName.replace(/^\d+\s*/, '').trim(); // Remove leading numbers
    itemName = itemName.replace(/\s+/g, ' ').trim(); // Normalize whitespace

    // Only add if we have a meaningful item name
    if (itemName.length > 2 && itemName.length < 50) {
      // Try to categorize the item
      const category = categorizeFoodItem(itemName);
      
      items.push({
        item: itemName,
        price,
        quantity,
        category
      });
    }
  }

  return items;
}

function categorizeFoodItem(itemName: string): string {
  const lowerName = itemName.toLowerCase();
  
  if (lowerName.includes('milk') || lowerName.includes('cheese') || 
      lowerName.includes('yogurt') || lowerName.includes('butter') ||
      lowerName.includes('cream') || lowerName.includes('ice cream')) {
    return 'dairy';
  }
  
  if (lowerName.includes('beef') || lowerName.includes('chicken') || 
      lowerName.includes('pork') || lowerName.includes('turkey') ||
      lowerName.includes('fish') || lowerName.includes('salmon') ||
      lowerName.includes('tuna') || lowerName.includes('shrimp') ||
      lowerName.includes('meat') || lowerName.includes('steak')) {
    return 'meat';
  }
  
  if (lowerName.includes('apple') || lowerName.includes('banana') || 
      lowerName.includes('orange') || lowerName.includes('tomato') ||
      lowerName.includes('lettuce') || lowerName.includes('carrot') ||
      lowerName.includes('onion') || lowerName.includes('potato') ||
      lowerName.includes('broccoli') || lowerName.includes('spinach') ||
      lowerName.includes('fruit') || lowerName.includes('vegetable')) {
    return 'produce';
  }
  
  if (lowerName.includes('bread') || lowerName.includes('rice') || 
      lowerName.includes('pasta') || lowerName.includes('flour') ||
      lowerName.includes('cereal') || lowerName.includes('oatmeal') ||
      lowerName.includes('granola') || lowerName.includes('wheat')) {
    return 'grains';
  }
  
  if (lowerName.includes('chips') || lowerName.includes('cookies') || 
      lowerName.includes('candy') || lowerName.includes('soda') ||
      lowerName.includes('juice') || lowerName.includes('snack') ||
      lowerName.includes('frozen') || lowerName.includes('canned')) {
    return 'processed';
  }
  
  return 'other';
} 