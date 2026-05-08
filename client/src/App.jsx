import React, { useState } from 'react';
import Submitter from './Submitter';
import Worker from './Worker';

export default function App() {
  const [activeTab, setActiveTab] = useState('submitter');

  return (
    <div>
      {/* Navigation */}
      <nav className="bg-gray-900 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                WASM Compute
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('submitter')}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'submitter'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Submit Job
              </button>
              <button
                onClick={() => setActiveTab('worker')}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'worker'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Worker
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="bg-gray-50">
        {activeTab === 'submitter' ? <Submitter /> : <Worker />}
      </main>
    </div>
  );
}