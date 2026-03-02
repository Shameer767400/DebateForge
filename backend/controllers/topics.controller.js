const { Topic } = require('../models');
const redisClient = require('../config/redis');

async function getAllTopics(req, res) {
  try {
    const topics = await Topic.getAll();

    const byCategory = topics.reduce((acc, topic) => {
      const cat = topic.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(topic);
      return acc;
    }, {});

    return res.status(200).json({
      topics,
      byCategory,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in getAllTopics controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function voteOnTopic(req, res) {
  try {
    const topicId = req.params.id;
    const key = `vote:${req.user.id}:${topicId}`;

    let voted = false;
    let updatedTopic;

    const alreadyVoted = redisClient ? await redisClient.get(key) : null;

    if (alreadyVoted) {
      // Remove vote
      updatedTopic = await Topic.findByIdAndUpdate(
        topicId,
        { $inc: { voteCount: -1 } },
        { new: true }
      );

      if (!updatedTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      if (redisClient) {
        await redisClient.del(key);
      }

      voted = false;
    } else {
      // Add vote
      updatedTopic = await Topic.findByIdAndUpdate(
        topicId,
        { $inc: { voteCount: 1 } },
        { new: true }
      );

      if (!updatedTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      if (redisClient) {
        await redisClient.set(key, '1');
      }

      voted = true;
    }

    return res.status(200).json({
      voted,
      voteCount: updatedTopic.voteCount,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in voteOnTopic controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function proposeTopic(req, res) {
  try {
    const { title, category } = req.body;

    if (!title || title.length < 10 || title.length > 200) {
      return res
        .status(400)
        .json({ error: 'Title must be between 10 and 200 characters' });
    }

    const topic = new Topic({
      title,
      category,
      difficulty: 'medium',
      isActive: false,
      createdBy: req.user.id,
    });

    await topic.save();

    return res.status(201).json({
      topic,
      message: 'Topic submitted for review',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in proposeTopic controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getAllTopics,
  voteOnTopic,
  proposeTopic,
};

