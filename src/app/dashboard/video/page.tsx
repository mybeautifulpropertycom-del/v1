import Link from "next/link";
import { ArrowRight, Film, Images, Play, Sparkles } from "lucide-react";
import { photos } from "@/lib/demo";
export default function Page() {
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">THE NEXT CHAPTER</span>
          <h1>
            A home worth seeing.
            <br />
            <em>A story worth moving.</em>
          </h1>
          <p>
            Your future home for property films, from first frame to final cut.
          </p>
        </div>
        <span className="coming-pill">
          <span />
          Coming soon
        </span>
      </div>
      <section className="video-stage">
        <img src={photos.villa} alt="Contemporary home with a private garden" />
        <div className="video-stage-overlay">
          <span className="video-play">
            <Play size={30} fill="currentColor" />
          </span>
          <span className="eyebrow">A NEW PERSPECTIVE IS ON ITS WAY</span>
          <h2>
            From stills.
            <br />
            To something moving.
          </h2>
          <p>Beautiful property films, built from your photos.</p>
        </div>
        <span className="video-corner">MY BEAUTIFUL PROPERTY / STUDIO</span>
      </section>
      <div className="video-roadmap">
        {[
          {
            icon: Images,
            title: "Start with your photos",
            text: "The photographs you upload to your property will be the starting point for your film.",
          },
          {
            icon: Sparkles,
            title: "Bring the space to life",
            text: "A future Higgsfield connection will power image-to-video generation.",
          },
          {
            icon: Film,
            title: "Make the final cut",
            text: "A video editor will let you refine the story before sharing it with your clients.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon size={23} />
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div className="video-note">
        <p>
          Video generation and editing are planned features. There are no
          connected video services or generation charges in this version.
        </p>
        <Link href="/dashboard/properties/new">
          Start with a property <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
