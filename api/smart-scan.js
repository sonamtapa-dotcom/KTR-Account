// Vercel Serverless Function: /api/smart-scan
// Add OPENAI_API_KEY in Vercel Project Settings > Environment Variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { image, defaultBillType = 'Local Bill' } = req.body || {};
    if (!image || !image.startsWith('data:image/')) return res.status(400).send('Missing bill image');
    if (!process.env.OPENAI_API_KEY) return res.status(500).send('OPENAI_API_KEY is not configured');

    const schema = {
      name: 'ktr_bill_extraction',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          store: { type: 'string' },
          billType: { type: 'string', enum: ['Local Bill', 'Tax Bill'] },
          date: { type: 'string', description: 'YYYY-MM-DD if visible, otherwise blank' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          warning: { type: 'string' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                date: { type: 'string' },
                store: { type: 'string' },
                item: { type: 'string', description: 'Translate Nepali item names to simple English when possible' },
                originalText: { type: 'string', description: 'Original item text if Nepali/handwritten' },
                category: { type: 'string', enum: ['Kitchen','Water','Staff Meal','Electricity','Fuel','Supply','Cleaning','Maintenance','Office','Other'] },
                amount: { type: 'number' },
                billType: { type: 'string', enum: ['Local Bill','Tax Bill'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 }
              },
              required: ['date','store','item','originalText','category','amount','billType','confidence']
            }
          }
        },
        required: ['store','billType','date','confidence','warning','rows']
      }
    };

    const prompt = `You are reading a purchase bill/receipt for Karma Tara Residency in Kathmandu. Extract accounting rows from printed English, Nepali script, or handwritten local bills. Translate Nepali item names to simple English. Avoid using phone numbers, PAN/VAT numbers, invoice numbers, and dates as amounts. Prefer line items if visible; otherwise return one row for the best reliable payable total. Detect Tax Bill when VAT/PAN/tax invoice/VAT amount is present; otherwise use ${defaultBillType}. Always include confidence and warning if uncertain.`;

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image }
          ]
        }],
        text: { format: { type: 'json_schema', ...schema } }
      })
    });

    if (!r.ok) return res.status(500).send(await r.text());
    const data = await r.json();
    const jsonText = data.output_text || data.output?.[0]?.content?.find(c => c.type === 'output_text')?.text;
    if (!jsonText) return res.status(500).send('No structured output returned');
    return res.status(200).json(JSON.parse(jsonText));
  } catch (err) {
    return res.status(500).send(err.message || 'Smart scan failed');
  }
}
