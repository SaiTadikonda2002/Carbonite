import { BookOpen, Lightbulb, TrendingUp, Users } from 'lucide-react';

export default function Learn() {
  const topics = [
    {
      icon: '🌍',
      title: 'Climate Science Basics',
      description: 'Understanding the greenhouse effect, global warming, and climate change fundamentals',
      color: 'emerald',
    },
    {
      icon: '📊',
      title: 'Carbon Footprint Explained',
      description: 'Learn how carbon emissions are measured and what contributes to your footprint',
      color: 'teal',
    },
    {
      icon: '♻️',
      title: 'Sustainable Living',
      description: 'Practical tips for reducing waste, conserving energy, and living sustainably',
      color: 'cyan',
    },
    {
      icon: '🌱',
      title: 'Renewable Energy',
      description: 'Solar, wind, and other clean energy solutions for a sustainable future',
      color: 'green',
    },
    {
      icon: '🚗',
      title: 'Green Transportation',
      description: 'Exploring eco-friendly travel options and reducing transportation emissions',
      color: 'blue',
    },
    {
      icon: '🥗',
      title: 'Sustainable Diet',
      description: 'How food choices impact the environment and benefits of plant-based eating',
      color: 'lime',
    },
  ];

  const tips = [
    'Replace single-use items with reusable alternatives to reduce plastic waste',
    'Adjust your thermostat by 2°C to save energy and reduce emissions',
    'Choose seasonal and local produce to minimize food transportation emissions',
    'Unplug devices when not in use to prevent phantom energy consumption',
    'Walk, bike, or use public transport instead of driving alone',
    'Reduce food waste by meal planning and composting organic scraps',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Education Hub</h1>
        <p className="text-gray-600 mt-1">
          Learn about climate action and sustainable living
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topics.map((topic, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="text-5xl mb-4">{topic.icon}</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{topic.title}</h3>
            <p className="text-sm text-gray-600">{topic.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg p-8 text-white">
        <div className="flex items-center space-x-3 mb-4">
          <Lightbulb className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Quick Tips</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tips.map((tip, index) => (
            <div key={index} className="bg-white/20 p-4 rounded-lg">
              <div className="flex items-start space-x-3">
                <span className="text-2xl font-bold">{index + 1}</span>
                <p className="text-sm text-white/90 mt-1">{tip}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Why Climate Action Matters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Global Temperature Rise</h3>
            <p className="text-sm text-gray-600">
              Earth's temperature has risen 1.1°C since pre-industrial times, causing severe weather events
            </p>
          </div>
          <div className="text-center">
            <div className="bg-teal-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-teal-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Scientific Consensus</h3>
            <p className="text-sm text-gray-600">
              97% of climate scientists agree that human activities are causing global warming
            </p>
          </div>
          <div className="text-center">
            <div className="bg-cyan-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-cyan-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Collective Action</h3>
            <p className="text-sm text-gray-600">
              Individual actions combined create powerful change. Every step counts towards a sustainable future
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
