/**
 * AI Action Parser Service
 * Parses natural language action descriptions and calculates CO2 savings in pounds
 */

export interface ParsedAction {
  action: string;
  co2SavedLbs: number;
  category: string;
  description: string;
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Calculate CO2 savings based on common actions
 * Returns CO2 saved in pounds
 */
function calculateCO2Savings(action: string): number {
  const lowerAction = action.toLowerCase();
  
  // Transportation conversions (per mile)
  if (lowerAction.includes('bike') || lowerAction.includes('biked') || lowerAction.includes('cycling')) {
    const miles = extractNumber(action) || 1;
    // Biking saves ~0.88 lbs CO2 per mile compared to driving
    return miles * 0.88;
  }
  
  if (lowerAction.includes('walk') || lowerAction.includes('walked')) {
    const miles = extractNumber(action) || 1;
    // Walking saves ~0.88 lbs CO2 per mile compared to driving
    return miles * 0.88;
  }
  
  if (lowerAction.includes('public transport') || lowerAction.includes('bus') || lowerAction.includes('train')) {
    const miles = extractNumber(action) || 1;
    // Public transport saves ~0.6 lbs CO2 per mile compared to driving
    return miles * 0.6;
  }
  
  // Food actions
  if (lowerAction.includes('plant-based') || lowerAction.includes('vegetarian') || lowerAction.includes('vegan')) {
    const meals = extractNumber(action) || 1;
    // Plant-based meal saves ~8.8 lbs CO2 per meal
    return meals * 8.8;
  }
  
  if (lowerAction.includes('local food') || lowerAction.includes('local produce')) {
    // Local food saves ~1.1 lbs CO2 per meal
    return 1.1;
  }
  
  // Energy actions
  if (lowerAction.includes('turn off') || lowerAction.includes('unplug') || lowerAction.includes('energy')) {
    const hours = extractNumber(action) || 1;
    // Saving energy saves ~0.5 lbs CO2 per hour
    return hours * 0.5;
  }
  
  if (lowerAction.includes('led') || lowerAction.includes('light bulb')) {
    // LED bulb saves ~0.5 lbs CO2 per day
    return 0.5;
  }
  
  // Waste actions
  if (lowerAction.includes('recycle') || lowerAction.includes('recycled')) {
    const items = extractNumber(action) || 1;
    // Recycling saves ~0.2 lbs CO2 per item
    return items * 0.2;
  }
  
  if (lowerAction.includes('compost') || lowerAction.includes('composted')) {
    // Composting saves ~0.5 lbs CO2 per day
    return 0.5;
  }
  
  // Water actions
  if (lowerAction.includes('shorter shower') || lowerAction.includes('water')) {
    const minutes = extractNumber(action) || 1;
    // Shorter shower saves ~0.1 lbs CO2 per minute
    return minutes * 0.1;
  }
  
  // Default: estimate based on keywords
  if (lowerAction.includes('save') || lowerAction.includes('reduce') || lowerAction.includes('avoid')) {
    return 2.2; // Default 2.2 lbs CO2 saved
  }
  
  return 1.0; // Minimum 1 lb CO2 saved for any climate action
}

function extractNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function categorizeAction(action: string): string {
  const lowerAction = action.toLowerCase();
  
  if (lowerAction.includes('bike') || lowerAction.includes('walk') || lowerAction.includes('drive') || 
      lowerAction.includes('car') || lowerAction.includes('transport') || lowerAction.includes('commute') ||
      lowerAction.includes('bus') || lowerAction.includes('train')) {
    return 'Transportation';
  }
  
  if (lowerAction.includes('food') || lowerAction.includes('meal') || lowerAction.includes('eat') ||
      lowerAction.includes('plant-based') || lowerAction.includes('vegetarian') || lowerAction.includes('vegan')) {
    return 'Food';
  }
  
  if (lowerAction.includes('energy') || lowerAction.includes('electricity') || lowerAction.includes('light') ||
      lowerAction.includes('power') || lowerAction.includes('unplug') || lowerAction.includes('turn off')) {
    return 'Home';
  }
  
  if (lowerAction.includes('recycle') || lowerAction.includes('waste') || lowerAction.includes('plastic') ||
      lowerAction.includes('compost') || lowerAction.includes('trash')) {
    return 'Waste';
  }
  
  if (lowerAction.includes('water') || lowerAction.includes('shower')) {
    return 'Water';
  }
  
  return 'Materials';
}

/**
 * Parse action using AI (OpenAI) or fallback to rule-based calculation
 */
export async function parseActionWithAI(userInput: string): Promise<ParsedAction> {
  // If OpenAI API key is available, use AI
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a climate action parser. Analyze the user's action description and calculate CO2 savings in POUNDS (lbs). 
              Return a JSON object with: action (cleaned action description), co2SavedLbs (number in pounds), category (Transportation/Food/Home/Waste/Water/Materials), description (brief explanation).
              Examples:
              - "Biked 10 miles instead of driving" → {"action": "Biked 10 miles", "co2SavedLbs": 8.8, "category": "Transportation", "description": "Biking saves 0.88 lbs CO2 per mile compared to driving"}
              - "Ate plant-based meal" → {"action": "Plant-based meal", "co2SavedLbs": 8.8, "category": "Food", "description": "Plant-based meals save significant CO2 compared to meat"}
              Always return valid JSON only.`
            },
            {
              role: 'user',
              content: userInput
            }
          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new Error('OpenAI API error');
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (content) {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            action: parsed.action || userInput,
            co2SavedLbs: parsed.co2SavedLbs || calculateCO2Savings(userInput),
            category: parsed.category || categorizeAction(userInput),
            description: parsed.description || `Action saved ${parsed.co2SavedLbs || calculateCO2Savings(userInput)} lbs CO2`,
          };
        }
      }
    } catch (error) {
      console.error('AI parsing error, using fallback:', error);
    }
  }
  
  // Fallback to rule-based calculation
  const co2Saved = calculateCO2Savings(userInput);
  return {
    action: userInput,
    co2SavedLbs: co2Saved,
    category: categorizeAction(userInput),
    description: `Your action saved ${co2Saved.toFixed(1)} lbs of CO2 emissions`,
  };
}

