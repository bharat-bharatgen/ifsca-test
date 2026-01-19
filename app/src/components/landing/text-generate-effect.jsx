"use client";
import { useEffect } from "react";
import { motion, stagger, useAnimate } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Component for generating text with a staggered animation effect.
 *
 * @param {Object} props - The properties of the component.
 * @param {string} props.words - The text to display with animation.
 * @param {string} [props.className] - Additional classes for the container.
 * @param {boolean} [props.filter=true] - Whether to apply a blur filter to the text.
 * @param {number} [props.duration=0.5] - The duration of the animation for each word.
 * @returns {JSX.Element} The rendered TextGenerateEffect component.
 */
export const TextGenerateEffect = ({
  words,
  className,
  filter = true,
  duration = 0.5,
  textSize = "text-2xl",
  textStyles = "",
}) => {
  const [scope, animate] = useAnimate();
  const wordsArray = words.split(" ");

  useEffect(() => {
    animate(
      "span",
      {
        opacity: 1,
        filter: filter ? "blur(0px)" : "none",
      },
      {
        duration: duration ? duration : 1,
        delay: stagger(0.2),
      }
    );
  }, [scope.current]);

  /**
   * Renders the words with staggered animation.
   *
   * @returns {JSX.Element} The rendered words.
   */
  const renderWords = () => {
    return (
      <motion.div ref={scope}>
        {wordsArray.map((word, idx) => (
          <motion.span
            key={word + idx}
            className={cn("opacity-0", textStyles)}
            style={{
              filter: filter ? "blur(10px)" : "none",
            }}
          >
            {word}{" "}
          </motion.span>
        ))}
      </motion.div>
    );
  };

  return (
    <div className={cn("font-bold", className)}>
      <div className="mt-4">
        <div className={cn("leading-snug tracking-wide", textSize)}>
          {renderWords()}
        </div>
      </div>
    </div>
  );
};
