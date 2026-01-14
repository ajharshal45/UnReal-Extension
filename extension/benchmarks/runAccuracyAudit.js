/**
 * runAccuracyAudit.js
 * Comprehensive benchmarking script for ShareSafe AI detection.
 *
 * Usage (from workspace root):
 *   node extension/benchmarks/runAccuracyAudit.js
 */

import { scoreSegment } from '../segmentAnalyzer.js';
import { analyzeTextStatistics } from '../statisticalAnalyzer.js';

// Threshold to classify a segment as AI-generated for this audit (0-100)
const PREDICTION_THRESHOLD = 50;

// Test samples grouped by category
export const testSamples = [
  // ═══════════════════════════════════════════════════════════════
  // LONG TEXT (500+ words)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'long_ai_1',
    label: 'ai',
    category: 'Long Text AI',
    text: `Artificial intelligence has emerged as one of the most transformative technologies of the 21st century, fundamentally reshaping industries, economies, and daily life in ways that were previously unimaginable. The rapid advancement of machine learning algorithms, particularly deep neural networks, has enabled computers to perform tasks that were once exclusively within the domain of human cognition. From natural language processing to computer vision, from autonomous vehicles to medical diagnosis, AI systems are demonstrating capabilities that continue to expand at an exponential rate. It is important to note that these developments carry significant implications for the workforce, as automation threatens to displace millions of jobs while simultaneously creating new opportunities in emerging fields. The ethical considerations surrounding AI deployment cannot be overstated, as issues of bias, privacy, and accountability demand careful attention from researchers, policymakers, and society at large. Furthermore, the concentration of AI capabilities within a small number of technology companies raises concerns about power dynamics and equitable access to these transformative tools. In conclusion, while artificial intelligence offers unprecedented potential for solving complex global challenges, its development must be guided by principles that prioritize human welfare, fairness, and transparency. The coming decades will undoubtedly witness continued innovation in this space, and it is incumbent upon all stakeholders to ensure that these powerful technologies serve the broader interests of humanity.`
  },
  {
    id: 'long_human_1',
    label: 'human',
    category: 'Long Text Human',
    text: `So I've been thinking a lot about this whole AI thing lately, and honestly? It's kinda freaking me out a little bit. Like, don't get me wrong, I think it's super cool that we can talk to chatbots now and they actually make sense most of the time. My friend Sarah uses it to help with her essays and she says it's a game changer. But here's the thing that bugs me—nobody really knows where this is all going, do they? I was reading this article last week (can't remember where, maybe Wired or something?) and they were talking about how even the people building these systems don't fully understand how they work. That's... unsettling, right? It's like we built this incredibly powerful thing and we're just hoping it doesn't go sideways. My dad thinks I'm being dramatic. He's like "people said the same thing about the internet" and yeah, fair point I guess. The internet did turn out mostly fine, minus the whole misinformation and social media addiction stuff. But this feels different somehow? Maybe I'm just being paranoid. Anyway, I started learning to code recently because I figure if this AI stuff is gonna take over everything, I might as well understand how it works. Python seems cool so far. We'll see how long that lasts lol. What do you guys think? Am I overthinking this or is it actually something to worry about?`
  },

  // ═══════════════════════════════════════════════════════════════
  // MEDIUM BLOG (150-500 words)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'medium_ai_1',
    label: 'ai',
    category: 'Medium Blog AI',
    text: `The integration of artificial intelligence into healthcare represents a significant paradigm shift in medical practice. Machine learning algorithms are increasingly being deployed to analyze medical imaging, predict patient outcomes, and assist with diagnostic procedures. Moreover, these systems demonstrate remarkable accuracy in identifying patterns that might escape human observation. It is worth noting that the adoption of AI in clinical settings must be accompanied by rigorous validation protocols to ensure patient safety. Healthcare providers are finding that AI-powered tools can reduce administrative burden while improving the quality of care delivered. Additionally, the use of predictive analytics enables early intervention strategies that can significantly improve patient prognosis. In conclusion, while challenges remain in terms of regulatory frameworks and integration with existing workflows, the potential benefits of AI in healthcare are substantial and warrant continued investment.`
  },
  {
    id: 'medium_human_1',
    label: 'human',
    category: 'Medium Blog Human',
    text: `I finally got around to trying that new pizza place on Main Street everyone's been talking about. Honestly? It's pretty good but maybe not worth the 45 minute wait we had on Saturday night. The crust was nice and thin, kinda crispy which I like, and they don't skimp on the toppings. We got the margherita and a pepperoni—both solid choices. My only complaint is the place is tiny so you're basically sitting on top of other people, and it gets LOUD. Had to basically yell at my girlfriend across the table. Would I go back? Probably, but on a Tuesday when it's less crazy. Not sure it beats Tony's down the road but it's definitely up there. Oh and their garlic knots are fire, definitely get those. They come with this garlic butter dip that's addicting. Overall like a 7.5/10? Worth checking out if you're in the area.`
  },
  {
    id: 'medium_ai_2',
    label: 'ai',
    category: 'Medium Blog AI',
    text: `Sustainable living practices have become increasingly important in our modern world as environmental concerns continue to mount. There are several key strategies individuals can adopt to reduce their ecological footprint. First, minimizing single-use plastics by transitioning to reusable alternatives represents a practical starting point. Second, adopting a more plant-based diet can significantly reduce one's carbon emissions. Third, optimizing home energy usage through efficient appliances and improved insulation offers both environmental and financial benefits. It is essential to recognize that collective action, while composed of individual choices, can drive meaningful change at a societal level. Furthermore, supporting businesses that prioritize sustainability encourages broader market transformation. In summary, by integrating these practices into daily routines, individuals can contribute to a more sustainable future while often realizing personal benefits as well.`
  },

  // ═══════════════════════════════════════════════════════════════
  // SHORT TEXT (<50 words)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'short_ai_1',
    label: 'ai',
    category: 'Short Text AI',
    text: `It is important to note that consistency is key to success. 🚀`
  },
  {
    id: 'short_ai_2',
    label: 'ai',
    category: 'Short Text AI',
    text: `In conclusion, the evidence suggests that early intervention yields optimal outcomes.`
  },
  {
    id: 'short_ai_3',
    label: 'ai',
    category: 'Short Text AI',
    text: `Here are some key points to consider when evaluating this approach.`
  },
  {
    id: 'short_human_1',
    label: 'human',
    category: 'Short Text Human',
    text: `lol this is hilarious 😂😂 cant believe that happened`
  },
  {
    id: 'short_human_2',
    label: 'human',
    category: 'Short Text Human',
    text: `idk man seems kinda sus to me ngl`
  },
  {
    id: 'short_human_3',
    label: 'human',
    category: 'Short Text Human',
    text: `wait what?? that's crazy, I had no idea. thanks for sharing!`
  },

  // ═══════════════════════════════════════════════════════════════
  // PURE AI (formal, no red flags)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'pure_ai_1',
    label: 'ai',
    category: 'Pure AI',
    text: `The optimization algorithm demonstrates stable convergence characteristics when applied to convex objective functions with appropriate regularization parameters.`
  },
  {
    id: 'pure_ai_2',
    label: 'ai',
    category: 'Pure AI',
    text: `Empirical results indicate that the proposed methodology outperforms baseline approaches across multiple benchmark datasets.`
  },
  {
    id: 'pure_ai_3',
    label: 'ai',
    category: 'Pure AI',
    text: `The framework utilizes a modular architecture that facilitates extensibility while maintaining computational efficiency.`
  },

  // ═══════════════════════════════════════════════════════════════
  // MIXED (Human + AI)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'mixed_1',
    label: 'human',
    category: 'Mixed',
    text: `hey guys, here's what the bot said: The model demonstrates improved performance through systematic optimization of hyperparameters.`
  },
  {
    id: 'mixed_2',
    label: 'human',
    category: 'Mixed',
    text: `lol I asked ChatGPT for help and it said: It is important to note that proper preparation ensures successful outcomes in any endeavor.`
  },
  {
    id: 'mixed_3',
    label: 'human',
    category: 'Mixed',
    text: `Draft from AI below, gonna edit it later:\n1. Define objectives\n2. Establish metrics\n3. Iterate systematically`
  },

  // ═══════════════════════════════════════════════════════════════
  // SOCIAL MEDIA POSTS
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'social_ai_1',
    label: 'ai',
    category: 'Social Media AI',
    text: `🚀 Excited to announce our latest milestone! The journey continues. Here's what we learned: 1. Persistence pays 2. Team matters 3. Vision drives results. #growth #success`
  },
  {
    id: 'social_ai_2',
    label: 'ai',
    category: 'Social Media AI',
    text: `**Quick tip:** Consistency is the key to unlocking your full potential. What habits have transformed your life? 💡`
  },
  {
    id: 'social_ai_3',
    label: 'ai',
    category: 'Social Media AI',
    text: `The power of networking cannot be overstated. Building authentic connections leads to unprecedented opportunities. Let's connect! 🤝`
  },
  {
    id: 'social_human_1',
    label: 'human',
    category: 'Social Media Human',
    text: `just saw the sunset and hoooly crap 🌅 nature is insane sometimes. no filter btw`
  },
  {
    id: 'social_human_2',
    label: 'human',
    category: 'Social Media Human',
    text: `coffee number 3 today and it's only noon... someone send help 😅☕`
  },
  {
    id: 'social_human_3',
    label: 'human',
    category: 'Social Media Human',
    text: `ok but why is this song stuck in my head?? it's been 3 days make it stop`
  }
];

/**
 * Run the accuracy audit across `testSamples`.
 */
export async function runAccuracyAudit() {
  const results = [];
  let tp = 0, tn = 0, fp = 0, fn = 0;

  // Category breakdown
  const categoryStats = {};

  for (const sample of testSamples) {
    // Use scoreSegment for full pipeline testing
    const segment = {
      id: sample.id,
      text: sample.text,
      fullText: sample.text,
      wordCount: sample.text.split(/\s+/).filter(w => w.length > 0).length,
      type: 'paragraph'
    };

    const result = await scoreSegment(segment, { useLLMTiebreaker: false });

    const predictedAI = result.score >= PREDICTION_THRESHOLD;
    const actualAI = sample.label === 'ai';

    const correct = predictedAI === actualAI;

    if (actualAI && predictedAI) tp++;
    else if (!actualAI && !predictedAI) tn++;
    else if (!actualAI && predictedAI) fp++;
    else if (actualAI && !predictedAI) fn++;

    // Track by category
    if (!categoryStats[sample.category]) {
      categoryStats[sample.category] = { tp: 0, tn: 0, fp: 0, fn: 0, total: 0 };
    }
    categoryStats[sample.category].total++;
    if (actualAI && predictedAI) categoryStats[sample.category].tp++;
    else if (!actualAI && !predictedAI) categoryStats[sample.category].tn++;
    else if (!actualAI && predictedAI) categoryStats[sample.category].fp++;
    else if (actualAI && !predictedAI) categoryStats[sample.category].fn++;

    results.push({
      id: sample.id,
      category: sample.category,
      label: sample.label,
      predictedAI: predictedAI ? 'AI' : 'Human',
      score: result.score,
      confidence: result.confidence,
      wordCount: segment.wordCount,
      correct
    });
  }

  const total = testSamples.length;
  const accuracy = ((tp + tn) / total) * 100;
  const falsePositiveRate = (fp / (fp + tn)) * 100 || 0;
  const falseNegativeRate = (fn / (fn + tp)) * 100 || 0;

  // Print summary
  console.log('\n=== OVERALL ACCURACY ===');
  console.log(`Total samples: ${total}`);
  console.log(`Threshold: ${PREDICTION_THRESHOLD}`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
  console.log(`False Positive Rate: ${falsePositiveRate.toFixed(1)}%`);
  console.log(`False Negative Rate: ${falseNegativeRate.toFixed(1)}%`);

  // Print category breakdown
  console.log('\n=== ACCURACY BY CATEGORY ===');
  console.log('');

  for (const [category, stats] of Object.entries(categoryStats)) {
    const catAccuracy = ((stats.tp + stats.tn) / stats.total) * 100;
    const catCorrect = stats.tp + stats.tn;
    console.log(`${category}: ${catCorrect}/${stats.total} correct (${catAccuracy.toFixed(0)}%)`);
    if (stats.fp > 0) console.log(`  ⚠️ ${stats.fp} false positive(s)`);
    if (stats.fn > 0) console.log(`  ⚠️ ${stats.fn} false negative(s)`);
  }

  // Print per-sample details
  console.log('\n=== PER-SAMPLE BREAKDOWN ===\n');

  for (const r of results) {
    const status = r.correct ? '✅' : '❌';
    console.log(`${status} ${r.id} | ${r.category} | Label: ${r.label} | Predicted: ${r.predictedAI} | Score: ${r.score} | Words: ${r.wordCount}`);
  }

  // JSON summary
  console.log('\n=== JSON SUMMARY ===');
  console.log(JSON.stringify({
    total,
    accuracy: Math.round(accuracy),
    falsePositiveRate: Math.round(falsePositiveRate),
    falseNegativeRate: Math.round(falseNegativeRate),
    categoryBreakdown: Object.fromEntries(
      Object.entries(categoryStats).map(([cat, stats]) => [
        cat,
        { accuracy: Math.round(((stats.tp + stats.tn) / stats.total) * 100), total: stats.total }
      ])
    )
  }, null, 2));
}

// Run the audit
runAccuracyAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});