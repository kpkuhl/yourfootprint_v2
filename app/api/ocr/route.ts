import { NextRequest, NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize the Google Cloud Vision client
let client: ImageAnnotatorClient;

try {
  // Try to use direct credentials first (better for Vercel)
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
      client = new ImageAnnotatorClient({
        credentials: credentials,
      });
    } catch (parseError) {
      throw new Error('Invalid GOOGLE_CLOUD_CREDENTIALS format');
    }
  } 
  // Fall back to service account key file
  else if (process.env.GOOGLE_CLOUD_KEY_FILE) {
    client = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    });
  } 
  // Fall back to default credentials (if running on Google Cloud)
  else {
    client = new ImageAnnotatorClient();
  }
} catch (error) {
  client = null as any;
}

export async function POST(request: NextRequest) {
  try {
    if (!client) {
      return NextResponse.json(
        { error: 'Google Cloud Vision not configured. Please set up credentials.' },
        { status: 500 }
      );
    }

    const { imageUrl, imageData, imageType } = await request.json();

    if (!imageData && !imageUrl) {
      return NextResponse.json({ error: 'Image data or URL is required' }, { status: 400 });
    }

    let imageSource: any;

    if (imageData) {
      // Handle base64 image data
      imageSource = {
        image: {
          content: imageData
        }
      };
    } else {
      // Handle image URL (fallback)

      // Validate the image URL
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('blob:')) {
        return NextResponse.json({ error: 'Invalid image URL format' }, { status: 400 });
      }

      // Check if the image is accessible (for non-blob URLs)
      if (imageUrl.startsWith('http')) {
        try {
          const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
          if (!imageResponse.ok) {
            return NextResponse.json({ error: 'Image not accessible' }, { status: 400 });
          }
        } catch (error) {
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
    const [result] = await client.textDetection(imageSource);
    
    const detections = result.textAnnotations || [];

    if (detections.length === 0) {
      return NextResponse.json({ 
        error: 'No text detected in the image',
        extractedItems: []
      });
    }

    // Get the full text
    const fullText = detections[0].description || '';

    // Parse the text to extract food items
    const extractedItems = parseReceiptText(fullText);

    return NextResponse.json({
      success: true,
      fullText,
      extractedItems
    });

  } catch (error) {
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
    // Handle both formats: $1.23 and $ 1.23 (with space after dollar sign)
    const endPriceMatch = trimmedLine.match(/(\$?\s*\d+\.\d{2})\s*$/);
    if (endPriceMatch) {
      price = endPriceMatch[1];
    } else {
      // Look for prices that are clearly separated from item names
      // This pattern looks for prices that come after some text and are separated by spaces
      // Handle both formats: $1.23 and $ 1.23
      const separatedPriceMatch = trimmedLine.match(/([A-Za-z\s]+)\s+(\$?\s*\d+\.\d{2})/);
      if (separatedPriceMatch) {
        price = separatedPriceMatch[2];
      } else {
        // More flexible approach: find any price pattern in the line
        // but prioritize prices that appear after some text
        // Handle both formats: $1.23 and $ 1.23
        const allPriceMatches = trimmedLine.match(/(\$?\s*\d+\.\d{2})/g);
        
        if (allPriceMatches && allPriceMatches.length > 0) {
          // If there are multiple prices, take the last one (most likely to be the actual price)
          price = allPriceMatches[allPriceMatches.length - 1];
        } else {
          // Fall back to finding any price in the line, but be more careful
          // Look for prices that are at least 3 characters from the start (to avoid item codes)
          // Handle both formats: $1.23 and $ 1.23
          const priceMatch = trimmedLine.match(/(\$?\s*\d+\.\d{2})/);
          if (priceMatch) {
            const priceIndex = trimmedLine.indexOf(priceMatch[0]);
            // Only use this price if it's not at the very beginning (likely an item code)
            if (priceIndex > 3) {
              price = priceMatch[0];
            }
          }
        }
      }
    }

    // Format price to ensure it has a dollar sign
    if (price) {
      // Remove any existing dollar sign and spaces, then add it back
      const numericPrice = price.replace(/^\$\s*/, '').replace(/\s+/g, '');
      price = `$${numericPrice}`;
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

    // Clean up item name - be more aggressive about removing leading numbers/codes
    itemName = itemName.replace(/^\d+[A-Z]*\s*/, '').trim(); // Remove leading numbers and item codes
    itemName = itemName.replace(/^\d+\.\d+\s*/, '').trim(); // Remove leading decimal numbers
    itemName = itemName.replace(/\s+/g, ' ').trim(); // Normalize whitespace

    // For items with text between name and price, take only the first meaningful word/phrase
    // This handles cases like "BANANA ORGANIC 2.99" -> "BANANA"
    // But also handle cases like "QUAKER OATS" -> "QUAKER"
    const firstWordMatch = itemName.match(/^([A-Za-z]+)/);
    if (firstWordMatch && firstWordMatch[1].length >= 3) {
      // Don't override if the item name is already a good food item
      const lowerName = itemName.toLowerCase();
      const isFoodItem = lowerName.includes('quaker') || lowerName.includes('lipton') || 
                        lowerName.includes('morningstar') || lowerName.includes('maruchan') ||
                        lowerName.includes('dots') || lowerName.includes('mae') ||
                        lowerName.includes('huy') || lowerName.includes('sporting') ||
                        lowerName.includes('igloo') || lowerName.includes('stationery') ||
                        lowerName.includes('pens') || lowerName.includes('reusable');
      
      if (!isFoodItem) {
        itemName = firstWordMatch[1];
      }
    }

    // Skip lines that are mostly numbers or codes
    if (itemName.length < 3 || /^\d+$/.test(itemName)) {
      continue;
    }

    // More flexible item name validation
    if (itemName.length > 2 && itemName.length < 100) {
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