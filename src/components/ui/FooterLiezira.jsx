import React from 'react';
import { Copyright } from 'lucide-react';

const FooterLiezira = () => (
  <div className="mt-8 py-4 border-t border-gray-200 w-full text-center">
    <p className="text-gray-400 text-xs font-mono flex items-center justify-center gap-1">
      <Copyright size={12} /> {new Date().getFullYear()} Created by{' '}
      <span className="font-bold text-indigo-400">RuangSimulasi</span>
    </p>
  </div>
);

export default FooterLiezira;
