import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ServiceRatingProps {
  serviceRequestId: string;
  customerId: string;
}

const ServiceRating = ({ serviceRequestId, customerId }: ServiceRatingProps) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [existingRating, setExistingRating] = useState<{ rating: number; comment: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRating = async () => {
      const { data } = await supabase
        .from("service_ratings")
        .select("rating, comment")
        .eq("service_request_id", serviceRequestId)
        .maybeSingle();
      if (data) setExistingRating({ rating: data.rating, comment: data.comment || "" });
      setLoading(false);
    };
    fetchRating();
  }, [serviceRequestId]);

  const submitRating = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    const { error } = await supabase.from("service_ratings").insert({
      service_request_id: serviceRequestId,
      customer_id: customerId,
      rating,
      comment: comment.trim(),
    });
    if (error) {
      toast.error(t("rating_error"));
    } else {
      toast.success(t("rating_success"));
      setExistingRating({ rating, comment: comment.trim() });
    }
    setSubmitting(false);
  };

  if (loading) return null;

  // Already rated - show result
  if (existingRating) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-green-800">{t("your_rating")}</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn("w-4 h-4", star <= existingRating.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300")}
              />
            ))}
          </div>
        </div>
        {existingRating.comment && (
          <p className="text-xs text-green-700 italic">"{existingRating.comment}"</p>
        )}
      </div>
    );
  }

  // Rating form
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mt-2 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
        <Star className="w-3.5 h-3.5" />
        {t("rate_service")}
      </p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="p-0.5 transition-transform hover:scale-110"
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            onClick={() => setRating(star)}
          >
            <Star
              className={cn(
                "w-7 h-7 transition-colors",
                star <= (hoveredRating || rating)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300 hover:text-yellow-200"
              )}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <div className="space-y-2 animate-fade-in">
          <Textarea
            placeholder={t("rating_comment_placeholder")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="text-xs min-h-[60px] resize-none"
            maxLength={500}
          />
          <Button
            size="sm"
            className="h-8 text-xs w-full"
            onClick={submitRating}
            disabled={submitting}
          >
            {submitting ? t("loading_wait") : t("submit_rating")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ServiceRating;
