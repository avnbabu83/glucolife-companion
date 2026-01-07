import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { Activity } from 'lucide-react';
import moment from 'moment';

export default function GlucoseChart({ readings = [], targetMin = 70, targetMax = 140 }) {
  const chartData = readings
    .sort((a, b) => moment(a.reading_time, 'HH:mm').diff(moment(b.reading_time, 'HH:mm')))
    .map(r => ({
      time: r.reading_time,
      glucose: r.reading,
      context: r.context
    }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-100">
          <p className="text-sm font-semibold text-slate-800">{data.glucose} mg/dL</p>
          <p className="text-xs text-slate-500">{data.time}</p>
          {data.context && (
            <p className="text-xs text-slate-400 capitalize mt-1">{data.context.replace('_', ' ')}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-500" />
          Today's Glucose
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400">
            <p className="text-sm">No glucose readings today</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis 
                  domain={[40, 250]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={targetMin} stroke="#fbbf24" strokeDasharray="5 5" />
                <ReferenceLine y={targetMax} stroke="#fbbf24" strokeDasharray="5 5" />
                <Area 
                  type="monotone" 
                  dataKey="glucose" 
                  fill="url(#glucoseGradient)" 
                  stroke="none"
                />
                <Line 
                  type="monotone" 
                  dataKey="glucose" 
                  stroke="#10b981" 
                  strokeWidth={2.5}
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#10b981' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-amber-400" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fbbf24, #fbbf24 4px, transparent 4px, transparent 8px)' }}></div>
            <span>Target Range ({targetMin}-{targetMax})</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}