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
      // TECHNOLOGY
      {
        title: 'AI will replace all human jobs within 20 years',
        category: 'technology',
        difficulty: 'hard',
      },
      {
        title: 'Social media does more harm than good to society',
        category: 'technology',
        difficulty: 'medium',
      },
      {
        title: 'Cryptocurrency will replace traditional banking',
        category: 'technology',
        difficulty: 'medium',
      },

      // SOCIETY
      {
        title: 'Universal basic income should be implemented globally',
        category: 'society',
        difficulty: 'hard',
      },
      {
        title: 'Homework should be abolished in schools',
        category: 'society',
        difficulty: 'easy',
      },
      {
        title: 'The death penalty should be abolished worldwide',
        category: 'society',
        difficulty: 'hard',
      },

      // POLITICS
      {
        title: 'Democracy is the best form of government',
        category: 'politics',
        difficulty: 'hard',
      },
      {
        title: 'Voting age should be lowered to 16',
        category: 'politics',
        difficulty: 'easy',
      },
      {
        title: 'Politicians should have term limits',
        category: 'politics',
        difficulty: 'medium',
      },

      // EDUCATION
      {
        title: 'Online learning is better than classroom learning',
        category: 'education',
        difficulty: 'easy',
      },
      {
        title: 'Standardized testing should be abolished',
        category: 'education',
        difficulty: 'medium',
      },
      {
        title: 'University education should be free for all',
        category: 'education',
        difficulty: 'medium',
      },

      // ENVIRONMENT
      {
        title: 'A global carbon tax is necessary to fight climate change',
        category: 'environment',
        difficulty: 'hard',
      },
      {
        title: 'Nuclear energy is the solution to climate change',
        category: 'environment',
        difficulty: 'medium',
      },
      {
        title: 'Governments should mandate veganism to save the planet',
        category: 'environment',
        difficulty: 'hard',
      },

      // ECONOMY
      {
        title: 'Billionaires should not exist',
        category: 'economy',
        difficulty: 'medium',
      },
      {
        title: 'Free trade benefits all countries equally',
        category: 'economy',
        difficulty: 'hard',
      },
      {
        title: 'A 4-day work week should be the global standard',
        category: 'economy',
        difficulty: 'easy',
      },
    ];

    await Topic.insertMany(topics);
    console.log('✅ Seeded 18 topics successfully');
  } catch (error) {
    console.error('❌ Error seeding topics:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

seedTopics();

