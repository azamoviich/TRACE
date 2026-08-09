import React from 'react';

function Bone({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-card-hover rounded-lg animate-pulse ${className}`} style={style} />;
}

export function DashboardSkeleton() {
  return (
    <div className="pb-20 space-y-10">

      {/* Hero */}
      <div>
        <div className="flex items-center justify-between mb-7">
          <Bone className="h-3 w-32" />
          <Bone className="h-7 w-48 rounded-xl" />
        </div>
        <Bone className="h-16 w-64 mb-3" />
        <Bone className="h-4 w-28 mb-8" />
        <div className="flex items-start gap-x-8 flex-wrap">
          {[120, 96, 80, 104].map((w, i) => (
            <div key={i}>
              <Bone className="h-2.5 w-16 mb-2" />
              <Bone className={`h-7 w-${w === 80 ? 20 : w === 96 ? 24 : w === 104 ? 28 : 32} mb-1`} style={{ width: w }} />
              <Bone className="h-2.5 w-12 mt-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Chart + Top selling */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Bone className="h-3 w-24 mb-4" />
          <Bone className="h-[220px] w-full rounded-xl" />
        </div>
        <div>
          <Bone className="h-3 w-20 mb-4" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="py-2.5 border-b border-border last:border-0">
              <div className="flex items-center justify-between mb-1.5">
                <Bone className="h-3 w-32" />
                <Bone className="h-3 w-10" />
              </div>
              <Bone className="h-[2px] w-full ml-5" style={{ width: `${60 - i * 8}%` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-5">
            <Bone className="h-2.5 w-24 mb-5" />
            <Bone className="h-10 w-3/4 mb-2" />
            <Bone className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SalesSkeleton() {
  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Bone className="h-6 w-24" />
        <Bone className="h-8 w-56 rounded-xl" />
      </div>

      {/* Revenue trend + Top selling */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <Bone className="h-3 w-32" />
              <div className="flex gap-1.5">
                <Bone className="h-6 w-16 rounded-[3px]" />
                <Bone className="h-6 w-16 rounded-[3px]" />
                <Bone className="h-6 w-16 rounded-[3px]" />
              </div>
            </div>
            <Bone className="h-[240px] w-full rounded-lg" />
          </div>
          <div className="glass rounded-3xl p-5">
            <Bone className="h-3 w-36 mb-4" />
            <Bone className="h-[180px] w-full rounded-lg" />
          </div>
        </div>
        <div className="glass rounded-3xl p-5">
          <Bone className="h-3 w-24 mb-4" />
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <Bone className="h-3 w-4" />
                <div>
                  <Bone className="h-3 w-32 mb-1.5" />
                  <Bone className="h-2.5 w-16" />
                </div>
              </div>
              <div className="text-right">
                <Bone className="h-3 w-20 mb-1.5" />
                <Bone className="h-2.5 w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly + Category pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-3xl p-5 lg:col-span-2">
          <Bone className="h-3 w-28 mb-4" />
          <Bone className="h-[180px] w-full rounded-lg" />
        </div>
        <div className="glass rounded-3xl p-5">
          <Bone className="h-3 w-28 mb-4" />
          <div className="flex items-center gap-4 mt-2">
            <Bone className="w-28 h-28 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2.5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Bone className="h-2.5 w-20" />
                  <Bone className="h-2.5 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ABC table */}
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <Bone className="h-3 w-36" />
          <Bone className="h-7 w-48 rounded-lg" />
        </div>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2.5 border-b border-border last:border-0">
            <Bone className="h-3 w-4 flex-shrink-0" />
            <Bone className="h-3 flex-1 max-w-[180px]" />
            <Bone className="h-3 w-20 hidden sm:block" />
            <Bone className="h-3 w-24 ml-auto" />
            <Bone className="h-3 w-8" />
            <Bone className="h-3 w-12" />
            <Bone className="h-5 w-6 rounded-[3px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
