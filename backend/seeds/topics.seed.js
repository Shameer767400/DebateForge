const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const { Topic } = require('../models');

async function seedTopics() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not set in environment variables');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB for seeding topics');

    await Topic.deleteMany({});
    console.log('🗑️ Cleared existing topics');

    const topics = [
      // ═══════════════════════════════════════
      // TECHNOLOGY (10)
      // ═══════════════════════════════════════
      { title: 'AI will replace all human jobs within 20 years', category: 'technology', difficulty: 'hard' },
      { title: 'Social media does more harm than good to society', category: 'technology', difficulty: 'medium' },
      { title: 'Cryptocurrency will replace traditional banking', category: 'technology', difficulty: 'medium' },
      { title: 'Governments should regulate artificial intelligence strictly', category: 'technology', difficulty: 'hard' },
      { title: 'Smartphones have destroyed meaningful human interaction', category: 'technology', difficulty: 'easy' },
      { title: 'Self-driving cars should be allowed on all public roads', category: 'technology', difficulty: 'medium' },
      { title: 'Big tech companies should be broken up like monopolies', category: 'technology', difficulty: 'hard' },
      { title: 'Children under 13 should be banned from using social media', category: 'technology', difficulty: 'easy' },
      { title: 'Open-source software is superior to proprietary software', category: 'technology', difficulty: 'medium' },
      { title: 'Brain-computer interfaces will blur the line between human and machine', category: 'technology', difficulty: 'hard' },

      // ═══════════════════════════════════════
      // SOCIETY (10)
      // ═══════════════════════════════════════
      { title: 'Universal basic income should be implemented globally', category: 'society', difficulty: 'hard' },
      { title: 'Homework should be abolished in schools', category: 'society', difficulty: 'easy' },
      { title: 'The death penalty should be abolished worldwide', category: 'society', difficulty: 'hard' },
      { title: 'Cancel culture does more harm than good', category: 'society', difficulty: 'medium' },
      { title: 'Public surveillance cameras make society safer', category: 'society', difficulty: 'medium' },
      { title: 'Animal testing should be completely banned', category: 'society', difficulty: 'medium' },
      { title: 'Violent video games contribute to real-world violence', category: 'society', difficulty: 'easy' },
      { title: 'Freedom of speech should have no legal limits', category: 'society', difficulty: 'hard' },
      { title: 'Mandatory military service builds stronger citizens', category: 'society', difficulty: 'medium' },
      { title: 'Drug use should be decriminalized worldwide', category: 'society', difficulty: 'hard' },

      // ═══════════════════════════════════════
      // POLITICS (10)
      // ═══════════════════════════════════════
      { title: 'Democracy is the best form of government', category: 'politics', difficulty: 'hard' },
      { title: 'Voting age should be lowered to 16', category: 'politics', difficulty: 'easy' },
      { title: 'Politicians should have term limits', category: 'politics', difficulty: 'medium' },
      { title: 'Countries should adopt open border policies', category: 'politics', difficulty: 'hard' },
      { title: 'Lobbying is a form of legal corruption', category: 'politics', difficulty: 'medium' },
      { title: 'Voting should be made mandatory for all citizens', category: 'politics', difficulty: 'easy' },
      { title: 'The United Nations is ineffective at maintaining world peace', category: 'politics', difficulty: 'hard' },
      { title: 'Political parties do more to divide than unite a country', category: 'politics', difficulty: 'medium' },
      { title: 'Foreign aid does more harm than good to developing nations', category: 'politics', difficulty: 'hard' },
      { title: 'A single global government would benefit humanity', category: 'politics', difficulty: 'hard' },

      // ═══════════════════════════════════════
      // EDUCATION (10)
      // ═══════════════════════════════════════
      { title: 'Online learning is better than classroom learning', category: 'education', difficulty: 'easy' },
      { title: 'Standardized testing should be abolished', category: 'education', difficulty: 'medium' },
      { title: 'University education should be free for all', category: 'education', difficulty: 'medium' },
      { title: 'Coding should be a mandatory subject from elementary school', category: 'education', difficulty: 'easy' },
      { title: 'College degrees are becoming irrelevant in the modern job market', category: 'education', difficulty: 'medium' },
      { title: 'Teachers should be paid as much as doctors and engineers', category: 'education', difficulty: 'medium' },
      { title: 'Schools should teach financial literacy as a core subject', category: 'education', difficulty: 'easy' },
      { title: 'Grade-based education should be replaced by skill-based learning', category: 'education', difficulty: 'hard' },
      { title: 'Private schools create inequality in education', category: 'education', difficulty: 'hard' },
      { title: 'AI tutors will make human teachers obsolete', category: 'education', difficulty: 'hard' },

      // ═══════════════════════════════════════
      // ENVIRONMENT (10)
      // ═══════════════════════════════════════
      { title: 'A global carbon tax is necessary to fight climate change', category: 'environment', difficulty: 'hard' },
      { title: 'Nuclear energy is the solution to climate change', category: 'environment', difficulty: 'medium' },
      { title: 'Governments should mandate veganism to save the planet', category: 'environment', difficulty: 'hard' },
      { title: 'Electric vehicles are not as green as they claim to be', category: 'environment', difficulty: 'medium' },
      { title: 'Plastic should be completely banned worldwide', category: 'environment', difficulty: 'easy' },
      { title: 'Space colonization is more important than fixing Earth', category: 'environment', difficulty: 'hard' },
      { title: 'Fast fashion should be heavily regulated or taxed', category: 'environment', difficulty: 'medium' },
      { title: 'Individual actions are meaningless compared to corporate pollution', category: 'environment', difficulty: 'medium' },
      { title: 'Developed nations owe climate reparations to developing countries', category: 'environment', difficulty: 'hard' },
      { title: 'Renewable energy alone cannot meet global power demands', category: 'environment', difficulty: 'medium' },

      // ═══════════════════════════════════════
      // ECONOMY (10)
      // ═══════════════════════════════════════
      { title: 'Billionaires should not exist', category: 'economy', difficulty: 'medium' },
      { title: 'Free trade benefits all countries equally', category: 'economy', difficulty: 'hard' },
      { title: 'A 4-day work week should be the global standard', category: 'economy', difficulty: 'easy' },
      { title: 'Minimum wage should be a living wage everywhere', category: 'economy', difficulty: 'medium' },
      { title: 'Automation will cause mass unemployment within a decade', category: 'economy', difficulty: 'hard' },
      { title: 'The gig economy exploits workers more than it empowers them', category: 'economy', difficulty: 'medium' },
      { title: 'Inheritance tax should be significantly increased', category: 'economy', difficulty: 'hard' },
      { title: 'Remote work is better for both employees and companies', category: 'economy', difficulty: 'easy' },
      { title: 'Universal healthcare is an economic necessity, not a luxury', category: 'economy', difficulty: 'medium' },
      { title: 'Capitalism is the root cause of global inequality', category: 'economy', difficulty: 'hard' },
    ];

    await Topic.insertMany(topics);
    console.log('✅ Seeded 60 topics successfully (10 per category)');
  } catch (error) {
    console.error('❌ Error seeding topics:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

seedTopics();

