import React from "react";

export const AuthSkeleton = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="flex flex-col items-center justify-center w-full max-w-md p-4 space-y-4 bg-white rounded-lg shadow-lg">
        <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse"></div>
        <div className="w-full h-4 bg-gray-200 rounded-full animate-pulse"></div>
        <div className="w-full h-4 bg-gray-200 rounded-full animate-pulse"></div>
        <div className="w-full h-4 bg-gray-200 rounded-full animate-pulse"></div>
        <div className="w-full h-4 bg-gray-200 rounded-full animate-pulse"></div>
      </div>
    </div>
  );
};
