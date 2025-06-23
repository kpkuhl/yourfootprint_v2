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
  console.log('OCR API route called');
  
  try {
    if (!client) {
      console.error('Google Cloud Vision client not initialized');
      return NextResponse.json(
        { error: 'Google Cloud Vision not configured. Please set up credentials.' },
        { status: 500 }
      );
    }

    const { imageUrl, imageData, imageType } = await request.json();
    console.log('Request received with:', { 
      hasImageData: !!imageData, 
      hasImageUrl: !!imageUrl, 
      imageType 
    });

    if (!imageData && !imageUrl) {
      console.error('No image data or URL provided');
      return NextResponse.json({ error: 'Image data or URL is required' }, { status: 400 });
    }

    let imageSource: any;

    if (imageData) {
      // Handle base64 image data
      console.log('Processing OCR for base64 image data...');
      console.log('Image type:', imageType);
      console.log('Base64 data length:', imageData.length);
      
      imageSource = {
        image: {
          content: imageData
        }
      };
    } else if (imageUrl) {
      // Handle image URL (fallback)
      console.log('Processing OCR for image URL:', imageUrl);

      // Validate the image URL
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('blob:')) {
        console.error('Invalid image URL format:', imageUrl);
        return NextResponse.json({ error: 'Invalid image URL format' }, { status: 400 });
      }

      // Check if the image is accessible (for non-blob URLs)
      if (imageUrl.startsWith('http')) {
        try {
          console.log('Checking if image is accessible...');
          const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
          console.log('Image accessibility check status:', imageResponse.status);
          if (!imageResponse.ok) {
            console.error('Image not accessible:', imageResponse.status, imageResponse.statusText);
            return NextResponse.json({ error: 'Image not accessible' }, { status: 400 });
          }
        } catch (error) {
          console.error('Error checking image accessibility:', error);
          return NextResponse.json({ error: 'Cannot access image' }, { status: 400 });
        }
      }

      imageSource = {
        image: {
          source: {
            imageUri: imageUrl
          }
        }
      };
    }

    // Perform OCR on the image
    console.log('Calling Google Cloud Vision API...');
    console.log('Image source structure:', JSON.stringify(imageSource, null, 2));
    const [result] = await client.textDetection(imageSource);
    console.log('Google Cloud Vision API response received');
    
    const detections = result.textAnnotations || [];
    console.log('Number of text detections:', detections.length);
    console.log('Raw detection result:', JSON.stringify(result, null, 2));

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
    console.log('Full extracted text:', fullText);

    // Parse the text to extract food items
    const extractedItems = parseReceiptText(fullText);
    console.log('Parsed items count:', extractedItems.length);
    console.log('Parsed items:', extractedItems);

    if (extractedItems.length === 0 && fullText.length > 0) {
      console.log('Text was extracted but no items were parsed. This might indicate:');
      console.log('1. The parsing logic is too strict');
      console.log('2. The receipt format is different than expected');
      console.log('3. The text needs preprocessing');
    }

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

  console.log('Processing lines:', lines.length);
  console.log('Sample lines:', lines.slice(0, 5));

  // Common food keywords to identify items
  const foodKeywords = [
    'milk', 'bread', 'eggs', 'cheese', 'yogurt', 'butter', 'cream',
    'beef', 'chicken', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
    'apple', 'banana', 'orange', 'tomato', 'lettuce', 'carrot', 'onion',
    'rice', 'pasta', 'flour', 'sugar', 'salt', 'pepper', 'oil',
    'cereal', 'oatmeal', 'granola', 'nuts', 'chips', 'cookies',
    'soda', 'juice', 'water', 'coffee', 'tea', 'beer', 'wine',
    'organic', 'fresh', 'frozen', 'canned', 'bottle', 'pack', 'bag'
  ];

  // More flexible price regex patterns
  const pricePatterns = [
    /\$?\d+\.\d{2}/,           // $12.34 or 12.34
    /\$?\d+\.\d{1}/,           // $12.3 or 12.3
    /\$?\d+/,                  // $12 or 12
  ];
  
  // More flexible quantity regex patterns
  const quantityPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:x|@|ea|each|lb|oz|kg|g|pack|pkg)/i,
    /(\d+(?:\.\d+)?)\s*$/i,    // Number at end of line
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip header/footer lines
    if (trimmedLine.toLowerCase().includes('total') || 
        trimmedLine.toLowerCase().includes('subtotal') ||
        trimmedLine.toLowerCase().includes('tax') ||
        trimmedLine.toLowerCase().includes('change') ||
        trimmedLine.toLowerCase().includes('thank') ||
        trimmedLine.toLowerCase().includes('receipt') ||
        trimmedLine.toLowerCase().includes('store') ||
        trimmedLine.toLowerCase().includes('date') ||
        trimmedLine.toLowerCase().includes('time')) {
      continue;
    }

    // Skip very short lines
    if (trimmedLine.length < 3) {
      continue;
    }

    // Extract price - prioritize prices at the end of the line
    let price: string | undefined;
    
    // First, try to find price at the end of the line (most common in receipts)
    const endPriceMatch = trimmedLine.match(/(\$?\d+\.\d{2})\s*$/);
    if (endPriceMatch) {
      price = endPriceMatch[1];
      console.log(`Found end price: "${price}" in line: "${trimmedLine}"`);
    } else {
      // Fall back to finding any price in the line
      for (const pattern of pricePatterns) {
        const priceMatch = trimmedLine.match(pattern);
        if (priceMatch) {
          price = priceMatch[0];
          console.log(`Found price with pattern: "${price}" in line: "${trimmedLine}"`);
          break;
        }
      }
    }

    // Format price to ensure it has a dollar sign
    if (price) {
      // Remove any existing dollar sign and add it back
      const numericPrice = price.replace('$', '');
      price = `$${numericPrice}`;
      console.log(`Formatted price: "${price}"`);
    }

    // Extract quantity using multiple patterns
    let quantity: string | undefined;
    for (const pattern of quantityPatterns) {
      const quantityMatch = trimmedLine.match(pattern);
      if (quantityMatch) {
        quantity = quantityMatch[1];
        break;
      }
    }

    // Extract item name (remove price and quantity from line)
    let itemName = trimmedLine;
    if (price) {
      itemName = itemName.replace(price, '').trim();
    }
    if (quantity) {
      // Remove the full quantity match
      const quantityMatch = trimmedLine.match(quantityPatterns.find(p => p.test(trimmedLine)) || /()/);
      if (quantityMatch) {
        itemName = itemName.replace(quantityMatch[0], '').trim();
      }
    }

    // Clean up item name
    itemName = itemName.replace(/^\d+\s*/, '').trim(); // Remove leading numbers
    itemName = itemName.replace(/\s+/g, ' ').trim(); // Normalize whitespace

    // More flexible item name validation
    if (itemName.length > 2 && itemName.length < 100) {
      // Try to categorize the item
      const category = categorizeFoodItem(itemName);
      
      console.log(`Parsed line: "${trimmedLine}" -> item: "${itemName}", price: "${price}", quantity: "${quantity}", category: "${category}"`);
      
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