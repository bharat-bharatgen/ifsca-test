"use client";

import { useEffect, useRef, useState } from "react";
import "./videoplayer.css";
import { PlayIcon } from "lucide-react";

export const VideoPlayer = () => {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      } else { video.pause(); setPlaying(false); }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  const handleVideoPress = () => {
    if (playing) {
      setPlaying(false);
      videoRef.current?.pause();
    } else {
      setPlaying(true);
      videoRef.current?.play().catch(() => setPlaying(false));
    }
  };

  return (
    <div className="relative">
      {!playing && (
        <button
          type="button" aria-label="Play demonstration video"
          onClick={handleVideoPress}
          className="bg-primary bg-opacity-30 absolute left-[42%] top-[45%] md:left-[45%]  w-16 h-16  md:w-20 md:h-20 shadow-2xl drop-shadow-2xl rounded-full flex items-center justify-center cursor-pointer"
        >
          <PlayIcon className="w-8 h-8 text-white md:w-12 md:h-12 md:ml-2" />
        </button>
      )}
      {/*
        <div className="video-demo-mac absolute top-[10.3%] left-[9.95%] w-[80%] h-auto rounded-sm overflow-hidden">
        */}
      <div className="h-auto rounded-sm flex justify-center">
          <video
            loop
            muted
            // className="w-full h-full block aspect-[308/201] object-cover"
            className="w-full h-full block object-cover"
            ref={videoRef}
            playsInline
          >
            <source src="/assets/demos/demo_v1.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
      </div>
      {/*       
      <Image
        loading="lazy"
        alt="Macbook Demo"
        src="/assets/images/macbook.webp"
        className="relative overflow-hidden"
        height="310"
        width="1900"
      />
      */}
    </div>
  );
};
